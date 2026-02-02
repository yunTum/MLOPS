# Python x LightGBM MLOps App

## 概要
継続的なモデル作成・改善・運用を行うMLOpsアプリケーション。
FastAPI (Backend), Streamlit (Frontend), PostgreSQL (Metadata), DuckDB/Parquet (Data), MLflow (Tracking), Redis/RQ (Jobs) を使用。

## セットアップ

1. 依存ライブラリのインストール
```bash
pip install -r requirements.txt
```

2. 環境変数の設定
`.env` ファイルを確認・編集してください。
- `USE_LOCAL_SERVICES=True`: PostgreSQL/Redis不要で動作します (SQLite/Local MLflow使用)
- `USE_LOCAL_SERVICES=False`: PostgreSQL/Redis/Remote MLflowを使用します

3. データベースマイグレーション
```bash
alembic upgrade head
```
(初回は `alembic/env.py` の設定を確認してください)

4. ミドルウェアの起動 (Docker 等)
- PostgreSQL
- Redis
- MLflow (Local): `mlflow ui`

## 起動方法

### Docker (Recommended for Full Stack)
```bash
docker-compose up --build
```
- API: http://localhost:8000/docs
- UI: http://localhost:8501
- MLflow: http://localhost:5000
- Postgres/Redis are automatically provisioned.

### Local Mode (Python)
backend/frontend/worker separate start (see below).
```bash
uvicorn app.main:app --reload --port 8000
```
Swagger UI: http://localhost:8000/docs

### Frontend UI
```bash
streamlit run app/ui/dashboard.py --server.port 8501
```
UI: http://localhost:8501

### Worker (Optional for Async Jobs)
```bash
python app/worker.py
```

## 使い方
1. **Data Management**: CSVをアップロードしてDataset Versionを作成。
2. **Feature Builder**: 特徴量変換ルールを定義し、Feature Setを作成。
3. **Model Experiments**: Feature Setを選択して学習を実行。MLflowで実験を確認。
4. **Inference**: 学習済みモデルIDを指定して予測を実行。
