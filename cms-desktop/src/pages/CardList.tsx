import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { CARD_STATES, STATE_COLOR, CardState, canPerform } from "../lib/cards";
import { useAuth } from "../lib/AuthContext";
import { loadActiveKeySets, keySetOptions, KeySetRow } from "../lib/keySets";

interface CardRow {
  _id: string;
  cardId: string;
  csn?: string;
  state: CardState;
  kvn: number;
  userId?: { fullName: string; nationalId?: string };
  createdAt: string;
}

const CardListPage: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<CardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [state, setState] = useState<CardState | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [keySets, setKeySets] = useState<KeySetRow[]>([]);
  const [keySetId, setKeySetId] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.cms.api.get("/cards", {
        page,
        limit: 25,
        q: q || undefined,
        state,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, q, state]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = async () => {
    try {
      const active = await loadActiveKeySets();
      setKeySets(active);
      // One key set is the normal case, so prefill it — explicit, still one click.
      setKeySetId(active.length === 1 ? active[0].id : undefined);
      setCreateOpen(true);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const createCard = async () => {
    try {
      const card = await window.cms.api.post("/cards", { keySetId });
      message.success(`Created ${card.cardId}`);
      setCreateOpen(false);
      void load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Cards
      </Typography.Title>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        style={{ marginBottom: 16 }}
        styles={{ body: { paddingBlock: 16 } }}
      >
        <Space wrap>
          <Input.Search
            placeholder="Search card ID or CSN"
            allowClear
            style={{ width: 280 }}
            onSearch={(value) => {
              setPage(1);
              setQ(value);
            }}
          />
          <Select
            placeholder="All states"
            allowClear
            style={{ width: 200 }}
            value={state}
            onChange={(value) => {
              setPage(1);
              setState(value);
            }}
            options={CARD_STATES.map((s) => ({ value: s, label: s }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            Refresh
          </Button>
          {canPerform(user?.role, "assign-user") && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
            >
              New blank card
            </Button>
          )}
        </Space>
      </Card>

      <Table<CardRow>
        rowKey="_id"
        loading={loading}
        dataSource={rows}
        pagination={{
          current: page,
          total,
          pageSize: 25,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: "Card ID",
            dataIndex: "cardId",
            render: (value, row) => <Link to={`/cards/${row._id}`}>{value}</Link>,
          },
          {
            title: "CSN",
            dataIndex: "csn",
            render: (value) =>
              value || <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: "Cardholder",
            dataIndex: ["userId", "fullName"],
            render: (value) =>
              value || (
                <Typography.Text type="secondary">Unassigned</Typography.Text>
              ),
          },
          {
            title: "State",
            dataIndex: "state",
            render: (value: CardState) => (
              <Tag color={STATE_COLOR[value]}>{value}</Tag>
            ),
          },
          { title: "KVN", dataIndex: "kvn", width: 70 },
          {
            title: "Created",
            dataIndex: "createdAt",
            render: (value) => new Date(value).toLocaleString(),
          },
          {
            title: "",
            key: "actions",
            align: "right",
            render: (_, row) => (
              <Space>
                {["CREATED", "PERSONALIZE_FAILED"].includes(row.state) &&
                  canPerform(user?.role, "personalize") && (
                    <Link to={`/cards/${row._id}/personalize`}>
                      <Button size="small" type="primary">
                        Personalize
                      </Button>
                    </Link>
                  )}
                <Link to={`/cards/${row._id}`}>
                  <Button size="small">Details</Button>
                </Link>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={createOpen}
        title="New card"
        okText="Create"
        onCancel={() => setCreateOpen(false)}
        onOk={createCard}
        okButtonProps={{ disabled: !keySetId }}
      >
        <Typography.Paragraph type="secondary">
          The key set decides which keys the CMS uses to open this card's secure
          channel. Personalization never writes keys to the chip, so it has to
          match the keys the chip already carries.
        </Typography.Paragraph>
        <Select
          style={{ width: "100%" }}
          placeholder="Key set"
          value={keySetId}
          onChange={setKeySetId}
          options={keySetOptions(keySets)}
        />
        {keySets.length === 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="No active key set"
            description="Create one under Key management first."
          />
        )}
      </Modal>
    </>
  );
};

export default CardListPage;
