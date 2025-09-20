<pre lang="md">
```md
# InsightHub Dashboard 🚀

**Forecast Smarter. Allocate Better.**  
An AI-powered executive resource management dashboard built for the Novo Nordisk Hackathon 2025.

---

## 🔍 Overview

InsightHub is a strategic forecasting tool that helps executives and managers at Novo Nordisk make better data-driven decisions on resource planning, demand allocation, and utilization.

This interactive dashboard visualizes:

- 🔎 Top Resource Gaps by Project  
- 📊 Demand Share by Area  
- 🔥 Area Utilization Heatmap  
- 📈 Forecast vs Actual Trends  

All charts are exportable and the data is dynamically updatable from CSV or backend sources.

---

## 🛠 Tech Stack

| Layer       | Technology        |
|------------|-------------------|
| Frontend   | React + TypeScript + Recharts |
| Backend    | Python + FastAPI + Pandas     |
| Data       | CSV / XLSX Uploads + Pydantic Models |
| Styling    | TailwindCSS       |
| Deployment | Localhost / GitHub Integration |

---

## 📸 Preview

![Dashboard Preview](https://github.com/altrin7311/InsightHub-Dashboard/assets/dashboard-screenshot.png) <!-- Replace with actual image if uploaded -->

---

## 🚀 Getting Started

Clone the repo:

```bash
git clone https://github.com/altrin7311/InsightHub-Dashboard.git
cd InsightHub-Dashboard
```

### 1. Run Backend (FastAPI)

```bash
cd dashboard/backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Server runs on: `http://127.0.0.1:8000`

### 2. Run Frontend (React)

```bash
cd dashboard/frontend
npm install
npm run dev
```

App runs on: `http://localhost:5173`

---

## 📂 Folder Structure

```
InsightHub-Dashboard/
│
├── dashboard/
│   ├── backend/          # FastAPI backend with data processing
│   ├── frontend/         # React UI and chart components
│   ├── data/             # Sample CSV / Excel files
│   └── .gitignore
```

---

## 📌 Features

- Upload data via CSV or Excel
- Forecast vs Actual insights
- Top resource gaps by project
- Export charts as CSV/PDF
- Works on dark mode

---

## 👥 Team

- Altrin Titus – Developer / Dashboard Lead  
- Preethi / Kajal BPDC – Data Modeling  
- Team Hygeia – Novo Nordisk Hackathon  

---

## 🧠 Learnings

✅ Data wrangling with Pandas  
✅ FastAPI endpoints + Recharts integration  
✅ Real-time interactive dashboards  
✅ GitHub project collaboration  

---

## 📄 License

MIT License © 2025

---

> Built with 💡 at the Novo Nordisk Global Business Services Hackathon 2025.
```
</pre>
