// Package cache provides an in-memory TTL cache with a size limit and
// request coalescing (concurrent loads of the same key run once).
package cache

import (
	"container/list"
	"context"
	"fmt"
	"runtime/debug"
	"sync"
	"time"
)

// PanicError is the error returned to every caller sharing a load when the
// load function panicked. The panic is recovered so the process keeps running;
// nothing is cached, so the next call for the key loads again.
type PanicError struct {
	Value any    // the value passed to panic
	Stack []byte // stack of the panicking goroutine
}

func (e *PanicError) Error() string {
	return fmt.Sprintf("cache load panicked: %v", e.Value)
}

type entry[V any] struct {
	key     string
	value   V
	expires time.Time
}

type call[V any] struct {
	done    chan struct{}
	value   V
	err     error
	waiters int
}

// Cache holds successful results only. Entries expire after ttl and, when
// more than max entries exist, the oldest inserted are discarded first.
type Cache[V any] struct {
	ttl time.Duration
	max int
	now func() time.Time

	mu       sync.Mutex
	order    *list.List // front = oldest; elements hold *entry[V]
	items    map[string]*list.Element
	inflight map[string]*call[V]
}

// New creates a cache. now is the clock (use time.Now in production).
func New[V any](ttl time.Duration, max int, now func() time.Time) *Cache[V] {
	return &Cache[V]{
		ttl:      ttl,
		max:      max,
		now:      now,
		order:    list.New(),
		items:    make(map[string]*list.Element),
		inflight: make(map[string]*call[V]),
	}
}

// Len returns the number of stored entries (including expired ones not yet
// removed).
func (c *Cache[V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}

// Waiters returns the number of callers waiting on an in-flight load of key
// besides the one running it. Intended for tests.
func (c *Cache[V]) Waiters(key string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	if cl, ok := c.inflight[key]; ok {
		return cl.waiters
	}
	return 0
}

// Do returns the cached value for key, or calls load and caches its value if
// it succeeds. hit is true only when the value came from the cache. Errors
// are returned to every caller sharing the load but are never stored.
//
// load runs detached from the cancellation of the caller's ctx so that one
// caller leaving does not fail the others; load is responsible for its own
// timeout. A caller whose ctx is done stops waiting and gets ctx.Err().
func (c *Cache[V]) Do(ctx context.Context, key string, load func(context.Context) (V, error)) (v V, hit bool, err error) {
	c.mu.Lock()
	if el, ok := c.items[key]; ok {
		e := el.Value.(*entry[V])
		if c.now().Before(e.expires) {
			c.mu.Unlock()
			return e.value, true, nil
		}
		c.order.Remove(el)
		delete(c.items, key)
	}
	cl, joined := c.inflight[key]
	if joined {
		cl.waiters++
	} else {
		cl = &call[V]{done: make(chan struct{})}
		c.inflight[key] = cl
		go c.run(context.WithoutCancel(ctx), key, cl, load)
	}
	c.mu.Unlock()

	select {
	case <-cl.done:
		return cl.value, false, cl.err
	case <-ctx.Done():
		var zero V
		return zero, false, ctx.Err()
	}
}

func (c *Cache[V]) run(ctx context.Context, key string, cl *call[V], load func(context.Context) (V, error)) {
	cl.value, cl.err = safeLoad(ctx, load)

	c.mu.Lock()
	delete(c.inflight, key)
	if cl.err == nil && c.max > 0 {
		c.items[key] = c.order.PushBack(&entry[V]{key: key, value: cl.value, expires: c.now().Add(c.ttl)})
		for c.order.Len() > c.max {
			oldest := c.order.Front()
			c.order.Remove(oldest)
			delete(c.items, oldest.Value.(*entry[V]).key)
		}
	}
	c.mu.Unlock()
	close(cl.done)
}

// safeLoad calls load and converts a panic into a *PanicError. run executes in
// its own goroutine, so an unrecovered panic here would end the process.
func safeLoad[V any](ctx context.Context, load func(context.Context) (V, error)) (v V, err error) {
	defer func() {
		if r := recover(); r != nil {
			var zero V
			v, err = zero, &PanicError{Value: r, Stack: debug.Stack()}
		}
	}()
	return load(ctx)
}
