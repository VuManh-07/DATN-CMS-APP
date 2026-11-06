import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { STATE_COLOR, CardState, canPerform } from "../lib/cards";
import { useAuth } from "../lib/AuthContext";

/** Cardholder directory, with each person's card history. */
const UserListPage: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canPerform(user?.role, "assign-user");

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.cms.api.get("/users", {
        page,
        limit: 25,
        q: q || undefined,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (values: any) => {
    try {
      await window.cms.api.post("/users", {
        ...values,
        dateOfBirth: values.dateOfBirth?.toISOString(),
      });
      message.success("Cardholder created");
      setOpen(false);
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const openDetail = async (id: string) => {
    try {
      setDetail(await window.cms.api.get(`/users/${id}`));
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Cardholders
      </Typography.Title>

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}

      <Card style={{ marginBottom: 16 }} styles={{ body: { paddingBlock: 16 } }}>
        <Space wrap>
          <Input.Search
            placeholder="Search name, phone, national ID"
            allowClear
            style={{ width: 320 }}
            onSearch={(value) => {
              setPage(1);
              setQ(value);
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            Refresh
          </Button>
          {canEdit && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setOpen(true)}
            >
              New cardholder
            </Button>
          )}
        </Space>
      </Card>

      <Table
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
          { title: "Name", dataIndex: "fullName" },
          { title: "National ID", dataIndex: "nationalId", render: (v) => v || "—" },
          { title: "Phone", dataIndex: "phone", render: (v) => v || "—" },
          { title: "Email", dataIndex: "email", render: (v) => v || "—" },
          {
            title: "Status",
            dataIndex: "status",
            render: (v) => (
              <Tag color={v === "ACTIVE" ? "success" : "default"}>{v}</Tag>
            ),
          },
          {
            title: "",
            key: "actions",
            align: "right",
            render: (_, row) => (
              <Button size="small" onClick={() => openDetail(row._id)}>
                Cards
              </Button>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        title="New cardholder"
        footer={null}
        onCancel={() => setOpen(false)}
      >
        <Form layout="vertical" onFinish={create}>
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nationalId" label="National ID">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="dateOfBirth" label="Date of birth">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Create
          </Button>
        </Form>
      </Modal>

      <Modal
        open={!!detail}
        title={detail ? `Cards of ${detail.fullName}` : ""}
        footer={null}
        onCancel={() => setDetail(null)}
        width={760}
      >
        <Table
          rowKey="_id"
          size="small"
          pagination={false}
          dataSource={detail?.cards || []}
          columns={[
            {
              title: "Card ID",
              dataIndex: "cardId",
              render: (v, row: any) => (
                <Link to={`/cards/${row._id}`} onClick={() => setDetail(null)}>
                  {v}
                </Link>
              ),
            },
            { title: "CSN", dataIndex: "csn", render: (v) => v || "—" },
            {
              title: "State",
              dataIndex: "state",
              render: (v: CardState) => <Tag color={STATE_COLOR[v]}>{v}</Tag>,
            },
            { title: "KVN", dataIndex: "kvn", width: 70 },
            {
              title: "Issued",
              dataIndex: "issuedAt",
              render: (v) => (v ? new Date(v).toLocaleDateString() : "—"),
            },
          ]}
        />
      </Modal>
    </>
  );
};

export default UserListPage;
