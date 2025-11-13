import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export async function query(sql, params) {
    try {
        const result = await pool.query(sql, params);
        return result;
    } catch (err) {
        console.error("DB ERROR:", err);
        throw err;
    }
}
