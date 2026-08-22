# ロールバック

失敗した変更branchまたはPRをmergeせず破棄します。merge済みの場合は履歴を消さずrevert PRを作成します。Secret、SMB mount、本番サービスは別のHuman Gateで復旧します。
