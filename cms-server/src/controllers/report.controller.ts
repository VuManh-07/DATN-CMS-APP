"use strict";

import { Request, Response } from "express";
import { OK } from "../core/success.response";
import reportService from "../services/report.service";
import auditService from "../services/audit.service";

class ReportController {
  dashboard = async (req: Request, res: Response) => {
    const days = Number(req.query.days) || 30;
    new OK({
      message: "Dashboard",
      metadata: await reportService.dashboard(days),
    }).send(res);
  };

  auditLogs = async (req: Request, res: Response) => {
    new OK({
      message: "Audit logs",
      metadata: await auditService.list(req.query as any),
    }).send(res);
  };
}

export default new ReportController();
