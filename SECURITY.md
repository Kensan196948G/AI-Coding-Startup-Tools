# セキュリティ方針

## サポート

セキュリティ上の問題は、公開 issue でなくメンテナーへ直接報告してください。対応ポリシーは以下のとおりです。

| 深刻度 | 対応目標 |
|---|---|
| Critical | 24 時間以内にトリアージ、対応版リリースを優先 |
| High | 3 営業日以内にトリアージ |
| Medium / Low | 通常のリリースサイクルで対応 |

## 禁止事項

- API キー、トークン、Cookie、秘密鍵、実値入り `.env` のコミット
- `curl ... | sh` / `wget ... | bash` / `Invoke-Expression` による取得コード実行
- API キーを CLI 引数に含める実装
- TLS 検証の無効化
- 無承認の再帰削除、本番デプロイ、外部送信

詳細は [common/policies/secrets.md](./common/policies/secrets.md) と [common/policies/safety.md](./common/policies/safety.md) を参照してください。

## 報告手順

1. 影響範囲（バージョン、OS、再現手順）を整理する。
2. 秘密情報を報告内容に含めない。
3. メンテナーへ連絡し、トリアージを依頼する。
