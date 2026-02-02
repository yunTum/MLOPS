# Python x LightGBM MLOps App

## 概要
継続的なモデル作成・改善・運用を行うMLOpsアプリケーション。
データセット管理から特徴量エンジニアリング、モデル学習、実験管理までを一気通貫で提供します。

## 主な機能

### 1. Dataset Management
- **Upload**: CSV/Parquetファイルのアップロード
- **Schema**: データ型の定義と確認 (Parquet形式で型安全に保存)
- **Preview**: データのプレビュー確認

### 2. Feature Store (特徴量エンジニアリング)
- **Feature Builder**: 直感的なUIで特徴量を変換・生成
  - Lag, Rolling Window, Difference (Diff)
  - Group Aggregation (Mean, Max, Min, Std, Count)
  - Scaling, Encoding, Formula, etc.
- **Auto Generation**: 算術演算や多項式特徴量の自動生成
- **Row Filtering**:
  - 全体に対する行フィルタリング (条件指定)
  - Schema定義に基づいた型安全なフィルタリング (数値・日付の自動型変換)
- **Active Features**: 学習に使用する特徴量の選択管理
- **Analysis**: 特徴量とターゲット変数の関連性を分析 (Mutual Info, Correlation)

### 3. Model Training & Management
- **Experimentation**: LightGBMによるモデル学習
- **Tracking**: MLflowを用いた実験パラメータとメトリクスのトラッキング
- **Version Control**: 学習に使用したデータセットと特徴量セットのバージョン管理

## 技術スタック (Tech Stack)

### Backend
- **Framework**: FastAPI (Python)
- **Data Processing**: Pandas, Arrow/Parquet
- **ML**: LightGBM, Scikit-learn
- **Database**: PostgreSQL (MySQL/SQLite compatible)
- **Async Tasks**: Redis / RQ (Optional)

### Frontend
- **Framework**: Next.js (React)
- **Language**: TypeScript
- **Styling**: TailwindCSS, Shadcn/UI
- **Visualization**: Recharts

### Infrastructure
- **Container**: Docker, Docker Compose

## セットアップ & 起動

### Docker (推奨)
Full Stack (Backend + Frontend + DB + MLflow) を一括起動します。

```bash
docker-compose up --build
```

- **Frontend UI**: http://localhost:3000
- **Backend API**: http://localhost:8000/docs
- **MLflow UI**: http://localhost:5000

### Local Development

#### 1. Backend
```bash
# 依存ライブラリ
pip install -r requirements.txt

# DB Migration
alembic upgrade head

# 起動
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
アクセス: http://localhost:3000
