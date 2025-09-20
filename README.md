# 📊 InsightHub Dashboard

**Forecast Smarter. Allocate Better.**  
An AI-powered executive resource management dashboard built for the **Novo Nordisk Hackathon 2025**.

---

## 🚀 Overview

**InsightHub** is a strategic forecasting tool that helps executives and managers at Novo Nordisk make smarter, data-driven decisions for:

- 📌 Resource Planning  
- 📈 Demand Allocation  
- 📉 Utilization Monitoring

This interactive dashboard visualizes:

- 🧩 **Top Resource Gaps by Project**  
- 📊 **Demand Share by Area**  
- 🔥 **Area Utilization Heatmap**  
- 📈 **Forecast vs Actual Trends**

All charts are exportable and the data is dynamically updateable via CSV or backend.

---

## 🛠️ Tech Stack

| Layer     | Tech Used                           |
|-----------|-------------------------------------|
| Frontend  | React · TypeScript · Recharts       |
| Backend   | Python · FastAPI · Pandas           |
| Styling   | Tailwind CSS                        |
| Data      | CSV / Excel Uploads                 |
| Deployment| Vite (Localhost)                    |

---

## 🧪 Features

- ✅ Upload CSV/XLSX data  
- ✅ Forecasting insights  
- ✅ Export charts (CSV/PDF)  
- ✅ Responsive dark/light mode  
- ✅ Works locally — no cloud dependency  

---

## ⚙️ How to Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/altrin7311/InsightHub-Dashboard.git
cd InsightHub-Dashboard/dashboard
```

### 2. Run the **Backend** (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

> 📍 Runs at: `http://127.0.0.1:8000`

### 3. Run the **Frontend** (React + Vite)

```bash
cd ../frontend
npm install
npm run dev
```

> 🌐 Opens at: `http://localhost:5173`

---

## 🗂️ Project Structure

```
InsightHub-Dashboard/
│
├── backend/        → FastAPI backend
├── frontend/       → React frontend UI
├── data/           → Sample CSV/XLSX files
└── .gitignore
```

---

## 👨‍💻 Team

- **Altrin Titus**, **Aiswarya Katta**, **Jain Prasad**, **Hibah Fathima**, **Preethi Palani** 
- **Team Hygeia** – Hackathon Collaboration

---

## 🧠 Learnings

- 🔍 Data wrangling with Pandas  
- ⚡ API building using FastAPI  
- 📊 Charting with Recharts  
- 🔄 CSV uploads with backend integration  
- 🧪 Rapid prototyping using Vite  

---

## 📄 License

MIT License © 2025 – Altrin Titus

---

> 💡 Built with ❤️ for the Novo Nordisk GBS Hackathon 2025
