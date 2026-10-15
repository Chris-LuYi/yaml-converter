# DaaS capability map

Tracks each DaaS capability and its implementation status in every region, as
a tree read from big to small scope: **Domain (L1) → Capability (L2) → Feature (L3)**.

```
Data Ingestion                 ← domain
├── Batch Ingestion            ← capability
│   ├── File drop (S3 / SFTP)  ← feature   NA: Live  EMEA: Live  APAC: In Progress ...
│   └── Database CDC
└── Streaming Ingestion        ← capability with no features (its own row)
```

The converter only handles flat rows, so the tree is flattened. Each row is one
leaf node and repeats its full path. `id` is a dotted path (`ING.BATCH.CDC`)
that keeps rows sorted depth-first.

| File | Purpose |
|------|---------|
| `schema.yaml` | Columns: tree levels, one status dropdown per region, delivery info |
| `daas-capabilities.yaml` | The capability map |

```bash
# YAML → Excel
yaml-converter -i daas-capabilities.yaml --schema schema.yaml -o daas-capabilities.xlsx

# Edited Excel → YAML (writes ./daas-capabilities/daas-capabilities.yaml)
yaml-converter -i daas-capabilities.xlsx --schema schema.yaml
```

In Excel, use the header auto-filter to look at one domain, or to find every
capability that isn't `Live` in a region.

**Adding a region:** add a `status_<region>` column with `options: *status` to
the schema, then give every row a value. Every region column is required.
