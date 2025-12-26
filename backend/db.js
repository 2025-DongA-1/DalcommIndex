// db.js
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import mysql from "mysql2/promise";

// ✅ db.js 파일이 있는 backend 폴더의 .env를 항상 읽음 (실행 위치(cwd)와 무관)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, ".env") });

// (선택) 로딩 확인용 - 문제 해결 후 제거해도 됩니다.
// console.log("[db] env loaded:", {
//   DB_HOST: process.env.DB_HOST,
//   DB_USER: process.env.DB_USER,
//   DB_NAME: process.env.DB_NAME,
//   DB_PORT: process.env.DB_PORT,
// });

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  connectTimeout: 30000,      // ✅ 연결 타임아웃 30초
  enableKeepAlive: true,      // ✅ TCP keep-alive
  keepAliveInitialDelay: 0,   // ✅ 즉시 keep-alive 시작                
});
