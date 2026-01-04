import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createAuthRouter } from "./routes/auth.js";
import { DatabaseService } from "./services/database.js";
import { UserService, TwoFAService, SessionService, SecurityEventService } from "./services/auth.js";
import { logger } from "./utils/logger.js";

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Initialize database service
const dbService = new DatabaseService();

// Initialize services
const userService = new UserService(dbService);
const twoFAService = new TwoFAService(dbService);
const sessionService = new SessionService(dbService);
const securityEventService = new SecurityEventService(dbService);

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use(
  "/api/auth",
  createAuthRouter(userService, twoFAService, sessionService, securityEventService)
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
});
