// Package cache provides an in-memory TTL cache with a size limit and
// request coalescing (concurrent loads of the same key run once).
package cache

import (
	"container/list"
	"context"
	"sync"
	"time"
)

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
	cl.value, cl.err = load(ctx)

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
