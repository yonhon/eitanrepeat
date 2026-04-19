# 英単語反復学習アプリ

英単語を繰り返し学習するための軽量なWebアプリです。  
ビルドは不要で、静的ファイルだけで動作します。

## 主な機能

- キーボード入力・手書き入力・音声入力に対応した学習フロー
- 複数の単語帳（A1 / A2 / B1 / B2）
- 学習進捗をブラウザの `localStorage` に保存
- 不正解・弱点・克服単語の管理
- 小テスト印刷ページ（`print.html`）
- 任意でアクセスログAPI（`/api/access`, `/api/logs/monthly`）を利用可能

## ファイル構成

- `index.html` - メイン画面
- `app.js` - アプリ本体ロジック
- `print.html` / `print.js` - 印刷用ページ
- `style.css` - スタイル
- `csv/` - 単語CSV・例文CSV
- `functions/` - Cloudflare Pages Functions（API）

## CSVフォーマット

単語CSV（`words_XX.csv`）:

```csv
id,word,expectedPos,answer1,answer2,answer3,answer4,answer5
```

例文CSV（`examples_XX.csv`）:

```csv
id,word,example_en,example_ja
```

補足:

- 単語CSVと例文CSVで `id` を一致させてください。
- 文字コードは UTF-8 推奨です。
- ファイルは `csv/` 配下に配置してください。

## ローカル起動方法

静的ファイルを配信できるサーバーであれば何でも動きます。  
例（Python）:

```bash
python -m http.server 8000
```

ブラウザで以下を開きます:

- `http://localhost:8000/`

## デプロイ（Cloudflare Pages）

このリポジトリは Cloudflare Pages + Functions に対応しています。

1. このリポジトリを Cloudflare Pages に接続
2. Build output directory を `.`（プロジェクトルート）に設定
3. `functions/` ディレクトリから Functions を有効化
4. アクセスログを使う場合は D1 を `ACCESS_LOG_DB` としてバインド
5. 端末IDをハッシュ化して表示するため、Pages の環境変数（Secret）に `LOG_HASH_SECRET` を設定

## ライセンス

- ソースコードは [MIT License](./LICENSE) です。
- `csv/` 配下のデータは MIT の対象外です。利用条件は [DATA_LICENSE.md](./DATA_LICENSE.md) を参照してください。
- 第三者クレジットの詳細は [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) を参照してください。
