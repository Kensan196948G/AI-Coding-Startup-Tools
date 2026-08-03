# 更新手順

1. 現在のバージョンと対象バージョンを確認する。

```bash
git tag
git describe --tags
```

2. `CHANGELOG.md` で破壊的変更の有無を確認する。
3. メジャー更新の場合は [移行ガイド] を確認してから実施する。
4. ローカル変更がある場合は更新せず停止する（`git status --porcelain` が空であることを確認）。
5. 取得して検証する。

```bash
git fetch --tags
git checkout vX.Y.Z
./scripts/linux/diagnose.sh
```

6. 既存のローカル設定は保持される（`.ai-startup-tools/` は Git 管理対象外）。
