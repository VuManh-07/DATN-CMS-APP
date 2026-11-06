import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";

/**
 * Audit log browser.
 *
 * Every lifecycle transition and every auth attempt lands here, written by the
 * server. Read-only by design — there is no edit or delete path, including for
 * SUPER_ADMIN.
 */

interface AuditRow {
  _id: string;
  at: string;
  actorUsername?: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  result: "SUCCESS" | "FAILURE";
  ip?: string;
  detail?: Record<string, any>;
}

const AuditLogPage: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetId, setTargetId] = useState("");
  const [result, setResult] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.cms.api.get("/audit-logs", {
        page,
        limit: 50,
        action: action || undefined,
        targetId: targetId || undefined,
        result,
        from: range?.[0]?.toISOString(),
        to: range?.[1]?.toISOString(),
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, action, targetId, result, range]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Export the rows currently loaded. Quotes are doubled per RFC 4180. */
  const exportCsv = () => {
    if (!rows.length) {
      message.info("Nothing to export");
      return;
    }
    const cell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "at",
      "actor",
      "role",
      "action",
      "targetType",
      "targetId",
      "result",
      "ip",
      "detail",
    ];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.at,
          r.actorUsername,
          r.actorRole,
          r.action,
          r.targetType,
          r.targetId,
          r.result,
          r.ip,
          r.detail ? JSON.stringify(r.detail) : "",
        ]
          .map(cell)
          .join(",")
      ),
    ];

    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Audit log
      </Typography.Title>

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}

      <Card style={{ marginBottom: 16 }} styles={{ body: { paddingBlock: 16 } }}>
        <Space wrap>
          <Input
            placeholder="Action (e.g. CARD_LOCKED)"
            style={{ width: 220 }}
            allowClear
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
          />
          <Input
            placeholder="Target (card ID)"
            style={{ width: 200 }}
            allowClear
            onChange={(e) => {
              setPage(1);
              setTargetId(e.target.value);
            }}
          />
          <Select
            placeholder="Any result"
            allowClear
            style={{ width: 150 }}
            value={result}
            onChange={(v) => {
              setPage(1);
              setResult(v);
            }}
            options={[
              { value: "SUCCESS", label: "SUCCESS" },
              { value: "FAILURE", label: "FAILURE" },
            ]}
          />
          <DatePicker.RangePicker
            showTime
            onChange={(v) => {
              setPage(1);
              setRange(v as [Dayjs, Dayjs] | null);
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            Refresh
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>
            Export page (CSV)
          </Button>
        </Space>
      </Card>

      <Table<AuditRow>
        rowKey="_id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          showSizeChanger: false,
          onChange: setPage,
        }}
        expandable={{
          rowExpandable: (r) => !!r.detail,
          expandedRowRender: (r) => (
            <pre style={{ margin: 0, fontSize: 12 }}>
              {JSON.stringify(r.detail, null, 2)}
            </pre>
          ),
        }}
        columns={[
          {
            title: "When",
            dataIndex: "at",
            width: 180,
            render: (v) => new Date(v).toLocaleString(),
          },
          {
            title: "Actor",
            dataIndex: "actorUsername",
            render: (v, r) =>
              v ? (
                <Space size={4}>
                  <span>{v}</span>
                  <Tag>{r.actorRole}</Tag>
                </Space>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
          { title: "Action", dataIndex: "action" },
          {
            title: "Target",
            dataIndex: "targetId",
            render: (v, r) => (v ? `${r.targetType || ""} ${v}`.trim() : "—"),
          },
          {
            title: "Result",
            dataIndex: "result",
            width: 110,
            render: (v) => (
              <Tag color={v === "SUCCESS" ? "success" : "error"}>{v}</Tag>
            ),
          },
          { title: "IP", dataIndex: "ip", render: (v) => v || "—" },
        ]}
      />
    </>
  );
};

export default AuditLogPage;
