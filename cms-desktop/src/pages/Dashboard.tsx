import React, { useEffect, useState } from "react";
import {
  Alert,
  Card,
  Col,
  Row,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { CARD_STATES, STATE_COLOR, CardState } from "../lib/cards";

interface Dashboard {
  byState: Record<string, number>;
  totals: { cards: number; users: number; activeBatches: number };
  issuedTrend: Array<{ date: string; count: number }>;
  topLockReasons: Array<{ reason: string; count: number }>;
  windowDays: number;
}

const DashboardPage: React.FC = () => {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.cms.api
      .get<Dashboard>("/reports/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error" message={error} showIcon />;
  if (!data) return <Spin size="large" />;

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Dashboard
      </Typography.Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Cards" value={data.totals.cards} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Cardholders" value={data.totals.users} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Batches in progress"
              value={data.totals.activeBatches}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Cards by state" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          {CARD_STATES.map((state) => (
            <Col span={4} key={state}>
              <Tag
                color={STATE_COLOR[state as CardState]}
                style={{ marginBottom: 6 }}
              >
                {state}
              </Tag>
              <div style={{ fontSize: 22, fontWeight: 600 }}>
                {data.byState[state] ?? 0}
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title={`Cards issued (last ${data.windowDays} days)`}>
            {data.issuedTrend.length === 0 ? (
              <Typography.Text type="secondary">
                No cards issued in this window.
              </Typography.Text>
            ) : (
              <Table
                size="small"
                pagination={false}
                rowKey="date"
                dataSource={data.issuedTrend}
                columns={[
                  { title: "Date", dataIndex: "date" },
                  { title: "Issued", dataIndex: "count", align: "right" },
                ]}
              />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Top lock reasons">
            {data.topLockReasons.length === 0 ? (
              <Typography.Text type="secondary">
                No locked cards.
              </Typography.Text>
            ) : (
              <Table
                size="small"
                pagination={false}
                rowKey="reason"
                dataSource={data.topLockReasons}
                columns={[
                  { title: "Reason", dataIndex: "reason" },
                  { title: "Cards", dataIndex: "count", align: "right" },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default DashboardPage;
