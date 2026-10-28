package cache

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func newTestCache(ttl time.Duration, max int) (*Cache[int], *fakeClock) {
	clk := &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	return New[int](ttl, max, clk.Now), clk
}

func counting(n *atomic.Int32, v int) func(context.Context) (int, error) {
	return func(context.Context) (int, error) {
		n.Add(1)
		return v, nil
	}
}

func TestHitWithinTTLAndMissAfter(t *testing.T) {
	c, clk := newTestCache(time.Hour, 10)
	var calls atomic.Int32
	ctx := context.Background()

	v, hit, err := c.Do(ctx, "k", counting(&calls, 7))
	if err != nil || v != 7 || hit {
		t.Fatalf("first: v=%d hit=%v err=%v", v, hit, err)
	}
	clk.Advance(time.Hour - time.Second)
	v, hit, err = c.Do(ctx, "k", counting(&calls, 8))
	if err != nil || v != 7 || !hit {
		t.Fatalf("second: v=%d hit=%v err=%v", v, hit, err)
	}
	if calls.Load() != 1 {
		t.Fatalf("calls = %d", calls.Load())
	}
	clk.Advance(time.Second) // exactly TTL: expired
	v, hit, _ = c.Do(ctx, "k", counting(&calls, 9))
	if v != 9 || hit || calls.Load() != 2 {
		t.Fatalf("after ttl: v=%d hit=%v calls=%d", v, hit, calls.Load())
	}
}

func TestErrorsAreNotCached(t *testing.T) {
	c, _ := newTestCache(time.Hour, 10)
	ctx := context.Background()
	boom := errors.New("boom")
	var calls atomic.Int32
	for i := 0; i < 2; i++ {
		_, hit, err := c.Do(ctx, "k", func(context.Context) (int, error) {
			calls.Add(1)
			return 0, boom
		})
		if !errors.Is(err, boom) || hit {
			t.Fatalf("err=%v hit=%v", err, hit)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("calls = %d, errors must not be cached", calls.Load())
	}
	v, _, err := c.Do(ctx, "k", counting(&calls, 5))
	if err != nil || v != 5 {
		t.Fatalf("recover: %d %v", v, err)
	}
}

func TestEvictsOldestOverLimit(t *testing.T) {
	c, _ := newTestCache(time.Hour, 3)
	ctx := context.Background()
	var calls atomic.Int32
	for _, k := range []string{"a", "b", "c", "d"} {
		c.Do(ctx, k, counting(&calls, 1))
	}
	if c.Len() != 3 {
		t.Fatalf("len = %d", c.Len())
	}
	// "a" is the oldest and gone; "b","c","d" remain.
	before := calls.Load()
	for _, k := range []string{"b", "c", "d"} {
		if _, hit, _ := c.Do(ctx, k, counting(&calls, 1)); !hit {
			t.Errorf("%s should be cached", k)
		}
	}
	if calls.Load() != before {
		t.Errorf("unexpected upstream calls")
	}
	if _, hit, _ := c.Do(ctx, "a", counting(&calls, 1)); hit {
		t.Errorf("a should have been evicted")
	}
}

func TestExpiredEntryRefreshedCountsOnce(t *testing.T) {
	c, clk := newTestCache(time.Minute, 2)
	ctx := context.Background()
	var calls atomic.Int32
	c.Do(ctx, "a", counting(&calls, 1))
	clk.Advance(2 * time.Minute)
	c.Do(ctx, "a", counting(&calls, 1))
	c.Do(ctx, "b", counting(&calls, 1))
	if c.Len() != 2 {
		t.Fatalf("len = %d", c.Len())
	}
}

func TestConcurrentSameKeyCallsLoaderOnce(t *testing.T) {
	c, _ := newTestCache(time.Hour, 10)
	var calls atomic.Int32
	release := make(chan struct{})
	started := make(chan struct{})
	load := func(context.Context) (int, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return 42, nil
	}
	const n = 20
	var wg sync.WaitGroup
	results := make([]int, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, _, err := c.Do(context.Background(), "k", load)
			if err != nil {
				t.Error(err)
			}
			results[i] = v
		}()
	}
	<-started
	// Give the other goroutines time to join the in-flight call.
	for c.Waiters("k") < n-1 {
		time.Sleep(time.Millisecond)
	}
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("loader calls = %d, want 1", calls.Load())
	}
	for _, v := range results {
		if v != 42 {
			t.Fatalf("result %d", v)
		}
	}
}

func TestConcurrentErrorSharedButNotCached(t *testing.T) {
	c, _ := newTestCache(time.Hour, 10)
	var calls atomic.Int32
	release := make(chan struct{})
	boom := errors.New("boom")
	load := func(context.Context) (int, error) {
		calls.Add(1)
		<-release
		return 0, boom
	}
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, _, err := c.Do(context.Background(), "k", load); !errors.Is(err, boom) {
				t.Errorf("err = %v", err)
			}
		}()
	}
	for c.Waiters("k") < 4 {
		time.Sleep(time.Millisecond)
	}
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("calls = %d", calls.Load())
	}
	if _, hit, _ := c.Do(context.Background(), "k", counting(&calls, 1)); hit {
		t.Fatal("error was cached")
	}
}

func TestWaiterCanCancel(t *testing.T) {
	c, _ := newTestCache(time.Hour, 10)
	release := make(chan struct{})
	started := make(chan struct{})
	go c.Do(context.Background(), "k", func(context.Context) (int, error) {
		close(started)
		<-release
		return 1, nil
	})
	<-started
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := c.Do(ctx, "k", counting(new(atomic.Int32), 2)); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v", err)
	}
	close(release)
}

func TestPanicInLoadIsRecoveredAndSharedWithAllWaiters(t *testing.T) {
	c, _ := newTestCache(time.Hour, 10)
	gate := make(chan struct{})
	load := func(context.Context) (int, error) {
		<-gate
		panic("boom")
	}
	const n = 5
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		go func() {
			_, _, err := c.Do(context.Background(), "k", load)
			errs <- err
		}()
	}
	deadline := time.Now().Add(5 * time.Second)
	for c.Waiters("k") < n-1 {
		if time.Now().After(deadline) {
			t.Fatal("waiters did not gather")
		}
		time.Sleep(time.Millisecond)
	}
	close(gate)
	for i := 0; i < n; i++ {
		var pe *PanicError
		if err := <-errs; !errors.As(err, &pe) || pe.Value != "boom" || len(pe.Stack) == 0 {
			t.Fatalf("waiter %d: err = %v, want *PanicError(boom) with stack", i, err)
		}
	}
	if c.Len() != 0 || c.Waiters("k") != 0 {
		t.Fatalf("panic left state behind: len=%d waiters=%d", c.Len(), c.Waiters("k"))
	}
}

func TestPanicIsNotCachedAndNextCallReloads(t *testing.T) {
	c, _ := newTestCache(time.Hour, 10)
	if _, _, err := c.Do(context.Background(), "k", func(context.Context) (int, error) { panic("boom") }); err == nil {
		t.Fatal("want error from panicking load")
	}
	var calls atomic.Int32
	v, hit, err := c.Do(context.Background(), "k", counting(&calls, 7))
	if err != nil || hit || v != 7 || calls.Load() != 1 {
		t.Fatalf("reload: v=%d hit=%v err=%v calls=%d", v, hit, err, calls.Load())
	}
}
