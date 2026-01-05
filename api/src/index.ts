import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createAuthRouter } from "./routes/auth.js";
import { createProfileRouter } from "./routes/profile.js";
import { createAdminRouter } from "./routes/admin.js";
import { createCavesRouter } from "./routes/caves.js";
import { DatabaseService } from "./services/database.js";
import { UserService, TwoFAService, SessionService, SecurityEventService } from "./services/auth.js";
import { AppSettingsService, ProfileService } from "./services/profile.js";
import { CaveService } from "./services/caves.js";
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
const profileService = new ProfileService(dbService);
const appSettingsService = new AppSettingsService(dbService);
const caveService = new CaveService(dbService);

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

app.use("/api/profile", createProfileRouter(sessionService, profileService, appSettingsService));

app.use(
  "/api/admin",
  createAdminRouter(sessionService, userService, profileService, appSettingsService)
);

app.use("/api/caves", createCavesRouter(sessionService, caveService));

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
