# OQL: Reading

OQL's design rule: **the query looks like the answer.** You write the shape
you want back; filters hang off sources with `?`; relationships you declared
in metadata are traversed by just naming them. Punctuation for reads, words
for writes, and every mistake is a prepare-time error with a position - never
a wrong result at runtime.

All of these run through `db.find()`, which returns `list[Document]`:

```dragon
# no block = the whole document
rows: list[Document] = db.find("customers ? id == 1")

# shaped projection: only these fields come back
rows = db.find("""customers ? city == "Lagos" { name, email }""")

# parameters are $name, injected as VALUES - injection is unrepresentable
rows = db.find("customers ? city == $c { name }", {"c": "Kano"})
```

Filters compose with `&`, `|`, `!` and parentheses; comparisons are the usual
six (`== != < <= > >=`). String matching is glob `~` (case-sensitive `*`/`?`)
and `~*` (case-insensitive); membership is `in`:

```dragon
db.find("""customers ? name ~ "A*" { name }""")
db.find("""orders ? status in ["paid", "shipped"]""")
db.find("""customers ? city == "Lagos" & (vip | missing!(vip))""")
```

OQL is its own small language, not embedded Dragon: booleans are spelled
`true` and `false`, and built-in functions take a trailing `!` (`len!`,
`lower!`, `year!`, `count!`) so an engine operation can never collide with a
field that happens to be named `count`.

## Nested reads follow your refs

Declared refs are the join conditions - metadata IS the on-clause. Mention
the related schema inside a projection block and you get it nested, with the
cardinality driving the shape: a 1:N ref nests an array, an N:1 ref nests an
object.

```dragon
# each customer with their paid orders nested inside
rows = db.find("""customers { name, orders ? status == "paid" { id, total } }""")
n_paid: int = len(rows[0]["orders"])
```

The parent always appears; a child array may just be empty (a left join, in
SQL words). When you want the join to *filter* the parents instead, use the
existence operators - `+` keeps parents that have a match, `-` keeps parents
that have none:

```dragon
db.find("""customers + (orders ? status == "paid") { name }""")   # with paid orders
db.find("customers - orders { name }")                          # with no orders at all
```

## Aggregates and grouping

A block of only aggregates summarizes the whole set; `by` groups first and
reads like English:

```dragon
totals: list[Document] = db.find("orders { n: count!(), revenue: sum!(total) }")
print(totals[0]["n"], totals[0]["revenue"])

per: list[Document] = db.find("orders by status { status, n: count!(), revenue: sum!(total) }")
```

Available aggregates: `count!()`, `count!(distinct x)`, `sum!`, `avg!`,
`min!`, `max!`, `any!`, `all!`. Aggregates summarize the source you are
standing on: to summarize a relationship, query from the many side (group
`orders by` and join what you need), or nest a block and reduce in Dragon.

## Pipelines

Stages after the block transform the result set, in order:

```dragon
top: list[Document] = db.find(
    """orders ? status == "paid" { id, total } | sort -total, id | take 10 | skip 0""")
```

`sort` is stable, `-field` descends, ties break on `_id`, and absent values
order after present ones regardless of direction.

## Two-valued logic - no SQL NULL trap

Every predicate is true or false, never *unknown*:

- A comparison touching an absent field is false.
- `!p` is pure negation. The consequence to internalize: `!(x > 3)` is TRUE
for documents that have no `x`, while `x <= 3` is false for them. When
presence is the question, ask it explicitly with `exists!(x)` /
`missing!(x)`.
- `x == null` matches stored nulls only, never absence.
- `x ?? fallback` coalesces both null and absence - which is what callers
almost always want:

```dragon
db.find("customers { name, tier: vip ?? false }")
```

## Mistakes fail before they run

OQL is typed at prepare time against your compiled schemas. An unknown
field, a type-mismatched comparison, an aggregate outside a block - all are
`PrepareError` before any document is touched:

```dragon
from odb.errors import PrepareError

try {
    db.find("customers ? age == 3")        # no such field
} except PrepareError as e {
    print(e)
}
try {
    db.find("customers ? id == \"x\"")     # int compared to a string
} except PrepareError as e {
    print(e)
}
```

Plans are cached by query text, so the prepare cost is paid once per distinct
query, not once per call.

