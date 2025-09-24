here ya go — a drop-in **README.md** you can paste into your repo. it collects the commands we used (git, backups, sftp, api checks, browser console debug, wiping data, etc). tweak hostnames/ids as needed.

---

# SE-CPVAL – ops cheatsheet

This doc lists the **exact commands** we used to debug, back up, reset data, and sync the repo with GitHub, so future-you can move fast without re-figuring things.

> Server paths assume Infomaniak layout:
>
> * **Repo root:** `/srv/customer/sites/se-cpval.ch`
> * **Runtime data root:** `/srv/customer/var/se-cpval/data`
> * **FTP-visible exports:** `/srv/customer/sites/se-cpval.ch/_export`
> * **App URLs:** `http://se-cpval.ch/portal/index.html`, `http://se-cpval.ch/form/app.html?id=<buildingId>`

---

## 0) Quick health & where things live

```bash
# go to repo root (on the server)
cd /srv/customer/sites/se-cpval.ch

# check app health (server prints DATA_ROOT, cwd, time)
curl -s http://se-cpval.ch/__health | python3 -m json.tool

# confirm runtime data root exists & is writable
ls -l /srv/customer/var/se-cpval
ls -l /srv/customer/var/se-cpval/data

# confirm FTP-visible export folder
ls -ld /srv/customer/sites/se-cpval.ch/_export || mkdir -p /srv/customer/sites/se-cpval.ch/_export
```

**Runtime data** (JSON, versions, logs) is **NOT** in the git repo; it’s under:

```
/srv/customer/var/se-cpval/data/orgs/<org>/foundations/<foundation>/buildings/<id>/{current.json, versions/, logs/, files/}
```

---

## 1) API sanity checks (curl)

```bash
# list buildings
curl -i http://se-cpval.ch/buildings

# fetch one building (metadata + current state)
curl -i http://se-cpval.ch/buildings/<id>

# list versions
curl -i http://se-cpval.ch/buildings/<id>/versions

# fetch a specific version
curl -i http://se-cpval.ch/buildings/<id>/versions/<versionId>

# save (creates a new version and bumps dataVersion)
curl -i -X POST \
  -H 'Content-Type: application/json' \
  -d '{"data": {"demo":"ok"}, "reason":"manual"}' \
  http://se-cpval.ch/buildings/<id>/save

# publish (with optimistic concurrency: If-Match + dataVersion)
# 1) first capture ETag + dataVersion:
curl -i http://se-cpval.ch/buildings/<id> | tee /tmp/resp.txt
ETAG=$(grep -i '^ETag:' /tmp/resp.txt | awk '{print $2}')
DV=$(curl -s http://se-cpval.ch/buildings/<id> | python3 -c "import sys,json;print(json.load(sys.stdin).get('dataVersion'))")

# 2) then publish
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "If-Match: $ETAG" \
  -d "{\"data\":{},\"dataVersion\":$DV,\"reason\":\"manual-publish\"}" \
  http://se-cpval.ch/buildings/<id>/publish
```

**Note on 412 Precondition Failed**
If publish returns `412` and the body includes a `current.dataVersion`, retry with that `dataVersion`.

---

## 2) Browser console tricks (front-end debugging)

Open the form page (e.g. `http://se-cpval.ch/form/app.html?id=testing`) and run:

```js
// Load the front-end API module and sanity check baseUrl (should be "")
const m = await import('/form/api.js');
m.api.baseUrl; // -> ""

// API reachable?
(await fetch('/buildings')).status; // -> 200

// Manual publish using the page's current context:
const id   = new URLSearchParams(location.search).get('id');
const meta = window.__buildingMeta || {};
const data = window.__renderedData || {};
await m.api.publish(id, data, meta.dataVersion, meta.etag); // -> { ok: true, dataVersion: N }
```

---

## 3) Backups you can download over FTP/SFTP

Create a tarball of **runtime data** into the FTP-visible `_export` folder:

```bash
# make a timestamped archive (safe to run repeatedly)
mkdir -p /srv/customer/sites/se-cpval.ch/_export
tar -czf /srv/customer/sites/se-cpval.ch/_export/se-cpval-data-$(date +%F-%H%M).tgz \
  -C /srv/customer/var se-cpval
ls -lh /srv/customer/sites/se-cpval.ch/_export
```

**Download via SFTP (from your laptop):**

```bash
sftp <username>@<host>
sftp> cd /srv/customer/sites/se-cpval.ch/_export
sftp> ls -lh
sftp> mget se-cpval-data-*.tgz
sftp> exit
```

---

## 4) Wipe/reset **all runtime data** (⚠️ destructive)

> This clears forms/versions/logs so the UI starts empty. Do a backup first.

```bash
# 1) BACKUP FIRST (see section 3)
# 2) then nuke runtime data
rm -rf /srv/customer/var/se-cpval/data/*

# verify it’s empty
ls -la /srv/customer/var/se-cpval/data

# (optionally) check health again
curl -s http://se-cpval.ch/__health | python3 -m json.tool
```

> If you still see data in the site after wiping, your browser might be caching; hard-reload the page. Also ensure the server points to `/srv/customer/var/se-cpval/data` (see `__health` output).

---

## 5) GitHub via SSH (recommended)

On the **server**:

```bash
cd /srv/customer/sites/se-cpval.ch

# one-time SSH key (use your email)
ssh-keygen -t ed25519 -C "you@example.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# copy and add this key to GitHub → Settings → SSH and GPG keys
cat ~/.ssh/id_ed25519.pub

# verify GitHub SSH works
ssh -T git@github.com   # should say "Hi <user>! You've successfully authenticated..."

# point origin to SSH
git remote set-url origin git@github.com:<user>/<repo>.git
```

Set identity (repo-local):

```bash
git config user.name  "<your name>"
git config user.email "<your email>"
```

---

## 6) Daily Git workflow (safe & boring)

```bash
cd /srv/customer/sites/se-cpval.ch

# fetch remote state
git fetch origin --prune

# see quick status (behind/ahead/dirty)
git status -sb

# compare HEAD and origin/main
git show -s --format='%h %s' HEAD origin/main
git rev-list --left-right --count origin/main...HEAD   # "0 0" -> identical

# see what YOU have locally that's not on remote
git diff --name-status origin/main..HEAD

# see what REMOTE has that you don't
git diff --name-status HEAD..origin/main

# pull only if fast-forward possible (no unwanted merge commits)
git pull --ff-only

# commit & push your changes
git add -A
git commit -m "Describe the change"
git push origin main
```

**Tag a stable state:**

```bash
git tag -a prod-$(date +%F) -m "Stable prod snapshot"
git push origin --tags
```

---

## 7) Handling a “working prod” branch and merging it

```bash
# create & push a prod sync branch from current state
git switch -c prod-sync-$(date +%Y%m%d-%H%M)
git push -u origin HEAD

# later merge it into main, prefer a no-ff to keep the merge visible
git switch main
git pull --ff-only
git merge --no-ff prod-sync-YYYYMMDD-HHMM

# resolve conflicts (edit files), then:
git add <conflicted-files>
git commit -m "Merge prod-sync-YYYYMMDD-HHMM into main"
git push origin main

# optional: clean up the branch
git branch -d prod-sync-YYYYMMDD-HHMM
git push origin --delete prod-sync-YYYYMMDD-HHMM
```

---

## 8) Useful greps when wiring UI ⇄ API

```bash
# find where "publish" is wired in the form app
grep -Rni "publish" client-demo/web/form

# typical files involved:
# - client-demo/web/form/api.js        (fetch() to /buildings/:id/*)
# - client-demo/web/form/diff.js       (publishWithConfirm, review panel)
# - client-demo/web/form/boot.js       (sets __lastPublishedSnapshot, etc.)
# - client-demo/api/src/server.ts      (Express routes)
```

---

## 9) Common gotchas we hit

* **Mixed protocol**: use `http://` for the site and API (not `https://`) unless you’ve configured TLS.
* **Front-end `baseUrl`** must be **same-origin** (`''`) so `fetch('/buildings')` hits the same host.
* **Publish race (412)**: server may return `{ current: { dataVersion } }`. Retry with that `dataVersion` and (optionally) `If-Match: <ETag>`.
* **Cache**: after wiping data, do a hard reload in the browser.
* **Git pulls that “diverged”**: prefer `git pull --ff-only` and use feature branches + merges you control.
* **SSH auth**: if `git@github.com: Permission denied (publickey)`, ensure you added the **public** key to GitHub and ran `ssh-add`.

---

## 10) One-liners you’ll reuse

```bash
# Show only changed file names vs remote
git diff --name-only origin/main...HEAD

# Show current commit locally & remote
git show -s --format='%h %s' HEAD origin/main

# Count commits ahead/behind (X Y)
git rev-list --left-right --count origin/main...HEAD

# Make a quick data backup to FTP folder
tar -czf /srv/customer/sites/se-cpval.ch/_export/se-cpval-data-$(date +%F-%H%M).tgz \
  -C /srv/customer/var se-cpval

# Wipe all runtime data (CAUTION)
rm -rf /srv/customer/var/se-cpval/data/*

# Health json (pretty)
curl -s http://se-cpval.ch/__health | python3 -m json.tool
```

---

**That’s it.** If you want, I can drop this straight into your repo as `README.md` (or `OPS_README.md`).
