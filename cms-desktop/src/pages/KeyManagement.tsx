import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useAuth } from "../lib/AuthContext";

/**
 * SCP03 key set management.
 *
 * Only SUPER_ADMIN may create, deprecate or delete key sets. Key material is never
 * returned by the API — the table shows metadata only, and a generated key
 * set's bytes exist solely inside the server's wrapped blob.
 */

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "success",
  DEPRECATED: "default",
  COMPROMISED: "error",
};

const KeyManagementPage: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"generate" | "manual">("generate");

  const load = useCallback(async () => {
    try {
      setRows(await window.cms.api.get("/keysets"));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (values: any) => {
    try {
      const body: any = {
        name: values.name,
        kvn: Number(values.kvn) || 1,
        derivationMode: values.derivationMode,
        description: values.description,
      };
      if (mode === "manual") {
        body.keys = {
          Key_ENC: values.Key_ENC?.trim(),
          Key_MAC: values.Key_MAC?.trim(),
          Key_DEK: values.Key_DEK?.trim(),
        };
      }
      await window.cms.api.post("/keysets", body);
      message.success("Key set created");
      setOpen(false);
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const remove = async (id: string) => {
    try {
      await window.cms.api.del(`/keysets/${id}`);
      message.success("Key set deleted");
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const deprecate = async (id: string) => {
    try {
      await window.cms.api.post(`/keysets/${id}/deprecate`);
      message.success("Key set deprecated");
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Key management
      </Typography.Title>

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}

      {!isSuperAdmin && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Read-only"
          description="Only a SUPER_ADMIN can create, deprecate or delete key sets."
        />
      )}

      <Card
        extra={
          isSuperAdmin && (
            <Button type="primary" onClick={() => setOpen(true)}>
              New key set
            </Button>
          )
        }
      >
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          columns={[
            { title: "Name", dataIndex: "name" },
            { title: "KVN", dataIndex: "kvn", width: 80 },
            { title: "Type", dataIndex: "keyType", width: 110 },
            {
              title: "Derivation",
              dataIndex: "derivationMode",
              render: (v) => (
                <Tag color={v === "DIVERSIFIED_BY_CSN" ? "green" : "default"}>
                  {v === "DIVERSIFIED_BY_CSN" ? "per-card" : "static"}
                </Tag>
              ),
            },
            {
              title: "Status",
              dataIndex: "status",
              render: (v) => <Tag color={STATUS_COLOR[v]}>{v}</Tag>,
            },
            { title: "Description", dataIndex: "description" },
            {
              title: "",
              key: "actions",
              align: "right",
              render: (_, row) =>
                isSuperAdmin ? (
                  <Space>
                    {row.status === "ACTIVE" && (
                      <Popconfirm
                        title="Deprecate this key set?"
                        description="Existing cards keep working; it stops being offered for new cards."
                        onConfirm={() => deprecate(row.id)}
                      >
                        <Button size="small">Deprecate</Button>
                      </Popconfirm>
                    )}
                    <Popconfirm
                      title="Delete this key set?"
                      description="Permanent. Refused while any card is still assigned to it."
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove(row.id)}
                    >
                      <Button size="small" danger>
                        Delete
                      </Button>
                    </Popconfirm>
                  </Space>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal
        open={open}
        title="New key set"
        footer={null}
        onCancel={() => setOpen(false)}
        width={560}
      >
        <Form
          layout="vertical"
          onFinish={create}
          initialValues={{ kvn: 1, derivationMode: "STATIC" }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="test-gp-default" />
          </Form.Item>
          <Form.Item name="kvn" label="Key version number (KVN)">
            <Input type="number" min={1} />
          </Form.Item>
          <Form.Item
            name="derivationMode"
            label="Derivation"
            extra="Static matches what the chips carry today. Per-card derivation is safer in principle, but personalization has no PUT KEY step — a per-card key set only works on chips whose keys were loaded out of band (JCShell), otherwise every card will fail mutual authentication."
          >
            <Select
              options={[
                { value: "STATIC", label: "Static (matches the chip as loaded)" },
                {
                  value: "DIVERSIFIED_BY_CSN",
                  label: "Per-card (by CSN) — needs keys loaded out of band",
                },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>

          <Form.Item label="Key material">
            <Select
              value={mode}
              onChange={setMode}
              options={[
                { value: "generate", label: "Generate randomly (recommended)" },
                { value: "manual", label: "Enter keys manually" },
              ]}
            />
          </Form.Item>

          {mode === "manual" && (
            <>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Keys are stored wrapped and can never be read back. Record them elsewhere if you need them."
              />
              {["Key_ENC", "Key_MAC", "Key_DEK"].map((field) => (
                <Form.Item
                  key={field}
                  name={field}
                  label={field}
                  rules={[
                    { required: true },
                    {
                      pattern: /^[0-9a-fA-F]{32}$/,
                      message: "Must be exactly 32 hex characters (AES-128)",
                    },
                  ]}
                >
                  <Input
                    placeholder="404142434445464748494A4B4C4D4E4F"
                    style={{ fontFamily: "Consolas, monospace" }}
                  />
                </Form.Item>
              ))}
            </>
          )}

          <Space>
            <Button type="primary" htmlType="submit">
              Create
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </Space>
        </Form>
      </Modal>
    </>
  );
};

export default KeyManagementPage;
