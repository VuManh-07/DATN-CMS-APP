import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  ACTIONS_BY_STATE,
  ACTION_LABEL,
  DESTRUCTIVE_ACTIONS,
  REASON_REQUIRED,
  STATE_COLOR,
  CardState,
  canPerform,
} from "../lib/cards";
import { useAuth } from "../lib/AuthContext";

/**
 * An account the wallet derived on the chip and reported at activation.
 * Public data only — an address and the public key behind it.
 */
interface AccountRow {
  index: number;
  address: string;
  publicKey: string;
  name?: string;
}

interface HistoryRow {
  _id: string;
  fromState: string | null;
  toState: CardState;
  reason?: string;
  at: string;
  actorId?: { username: string; role: string };
}

const CardDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [card, setCard] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Action dialog state: reason text, or a key set for rotate-key.
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [keySets, setKeySets] = useState<any[]>([]);
  const [targetKeySetId, setTargetKeySetId] = useState<string>();

  const load = useCallback(async () => {
    setError(null);
    try {
      setCard(await window.cms.api.get(`/cards/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAction = async (key: string) => {
    setReason("");
    setTargetKeySetId(undefined);
    if (key === "rotate-key") {
      try {
        setKeySets(await window.cms.api.get("/keysets"));
      } catch (e: any) {
        message.error(e.message);
        return;
      }
    }
    setAction(key);
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action === "personalize") {
        navigate(`/cards/${id}/personalize`);
        return;
      }
      const body: any = {};
      if (REASON_REQUIRED.includes(action) || reason) body.reason = reason;
      if (action === "rotate-key") body.targetKeySetId = targetKeySetId;

      const result = await window.cms.api.post(`/cards/${id}/${action}`, body);
      message.success(`${ACTION_LABEL[action]} done`);
      setAction(null);

      // Replace creates a new card — follow the operator to it.
      if (action === "replace" && result?.newCard?._id) {
        navigate(`/cards/${result.newCard._id}`);
        return;
      }
      // Key rotation puts the card back into personalization.
      if (action === "rotate-key") {
        navigate(`/cards/${id}/personalize`);
        return;
      }
      await load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Alert type="error" message={error} showIcon />;
  if (!card) return <Spin size="large" />;

  const available = (ACTIONS_BY_STATE[card.state as CardState] || []).filter(
    (a) => canPerform(user?.role, a)
  );

  return (
    <>
      <Space
        align="center"
        style={{ width: "100%", justifyContent: "space-between" }}
      >
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          {card.cardId} <Tag color={STATE_COLOR[card.state]}>{card.state}</Tag>
        </Typography.Title>
        <Space wrap>
          {available.map((a) => (
            <Button
              key={a}
              danger={DESTRUCTIVE_ACTIONS.includes(a)}
              type={a === "personalize" ? "primary" : "default"}
              onClick={() => openAction(a)}
            >
              {ACTION_LABEL[a]}
            </Button>
          ))}
          <Link to="/cards">
            <Button>Back to list</Button>
          </Link>
        </Space>
      </Space>

      {card.state === "PERSONALIZE_FAILED" && card.lastPersonalizeError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Last personalization attempt failed"
          description={card.lastPersonalizeError}
        />
      )}

      <Card title="Card" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="Card ID">{card.cardId}</Descriptions.Item>
          <Descriptions.Item label="CSN">{card.csn || "—"}</Descriptions.Item>
          <Descriptions.Item label="AID">{card.aid}</Descriptions.Item>
          <Descriptions.Item label="KVN">{card.kvn}</Descriptions.Item>
          <Descriptions.Item label="Key set">
            {card.keySetId?.name || "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Batch">
            {card.batchId?.batchCode || "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Applet version">
            {card.appletVersion || "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Expires">
            {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString() : "—"}
          </Descriptions.Item>
          {card.lockReason && (
            <Descriptions.Item label="Lock reason" span={2}>
              {card.lockReason}
            </Descriptions.Item>
          )}
          {card.revokeReason && (
            <Descriptions.Item label="Revoke reason" span={2}>
              {card.revokeReason}
            </Descriptions.Item>
          )}
          {card.replacesCardId && (
            <Descriptions.Item label="Replaces">
              <Link to={`/cards/${card.replacesCardId._id}`}>
                {card.replacesCardId.cardId}
              </Link>
            </Descriptions.Item>
          )}
          {card.replacedByCardId && (
            <Descriptions.Item label="Replaced by">
              <Link to={`/cards/${card.replacedByCardId._id}`}>
                {card.replacedByCardId.cardId}
              </Link>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="Cardholder" style={{ marginBottom: 16 }}>
        {card.userId ? (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Name">
              {card.userId.fullName}
            </Descriptions.Item>
            <Descriptions.Item label="National ID">
              {card.userId.nationalId || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Phone">
              {card.userId.phone || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {card.userId.email || "—"}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">
            No cardholder assigned yet.
          </Typography.Text>
        )}
      </Card>

      {/*
        Reported by the holder's wallet when it activates the card, not read
        here — this terminal never has the PIN. `accounts` is absent on a card
        that has never been set up, which is different from a card that was set
        up and has no accounts, so the two are shown differently.
      */}
      <Card
        title="On-card accounts"
        style={{ marginBottom: 16 }}
        extra={
          card.accountsSyncedAt ? (
            <Typography.Text type="secondary">
              Last reported {new Date(card.accountsSyncedAt).toLocaleString()}
            </Typography.Text>
          ) : null
        }
      >
        {card.accounts?.length ? (
          <Table<AccountRow>
            size="small"
            rowKey={(row) => row.index}
            dataSource={card.accounts as AccountRow[]}
            pagination={false}
            columns={[
              { title: "Slot", dataIndex: "index", width: 70 },
              {
                title: "Name",
                dataIndex: "name",
                width: 140,
                render: (value: string) => value || "—",
              },
              {
                title: "Address",
                dataIndex: "address",
                render: (value: string) => (
                  <Typography.Text copyable code>
                    {value}
                  </Typography.Text>
                ),
              },
              {
                title: "Public key",
                dataIndex: "publicKey",
                render: (value: string) => (
                  // Full key is long enough to wreck the layout; keep it
                  // copyable in full but show only the ends.
                  <Typography.Text copyable={{ text: value }} type="secondary">
                    {value.slice(0, 12)}…{value.slice(-8)}
                  </Typography.Text>
                ),
              },
            ]}
          />
        ) : (
          <Typography.Text type="secondary">
            {card.accountsSyncedAt
              ? "The wallet reported no accounts on this card."
              : "The wallet has not reported any accounts yet. This happens when the holder sets the card up."}
          </Typography.Text>
        )}
      </Card>

      <Card title="Lifecycle timeline">
        <Timeline
          items={(card.history as HistoryRow[]).map((h) => ({
            color:
              h.toState === "REVOKED" || h.toState === "PERSONALIZE_FAILED"
                ? "red"
                : h.toState === "ACTIVE"
                ? "green"
                : "blue",
            children: (
              <div>
                <Space>
                  {h.fromState && (
                    <Typography.Text type="secondary">
                      {h.fromState} →
                    </Typography.Text>
                  )}
                  <Tag color={STATE_COLOR[h.toState]}>{h.toState}</Tag>
                  <Typography.Text type="secondary">
                    {new Date(h.at).toLocaleString()}
                  </Typography.Text>
                </Space>
                <div style={{ color: "#595959" }}>
                  {h.reason || ""}
                  {h.actorId ? ` — ${h.actorId.username}` : ""}
                </div>
              </div>
            ),
          }))}
        />
      </Card>

      <Modal
        open={!!action}
        title={action ? ACTION_LABEL[action] : ""}
        okText="Confirm"
        confirmLoading={busy}
        okButtonProps={{
          danger: action ? DESTRUCTIVE_ACTIONS.includes(action) : false,
          disabled:
            (action && REASON_REQUIRED.includes(action) && !reason.trim()) ||
            (action === "rotate-key" && !targetKeySetId),
        }}
        onCancel={() => setAction(null)}
        onOk={runAction}
      >
        {action === "rotate-key" && (
          <>
            <Typography.Paragraph>
              Points this card at a different key set, so the CMS signs its
              secure channel with those keys. The card returns to
              personalization and you will need it in the reader to finish.
            </Typography.Paragraph>
            <Typography.Paragraph type="warning">
              This does not write keys to the chip — personalization has no PUT
              KEY step. Pick the key set that matches the keys the chip already
              carries, or mutual authentication will fail.
            </Typography.Paragraph>
            <Select
              style={{ width: "100%", marginBottom: 12 }}
              placeholder="Target key set"
              value={targetKeySetId}
              onChange={setTargetKeySetId}
              options={keySets
                .filter((k) => k.id !== card.keySetId?._id)
                .map((k) => ({
                  value: k.id,
                  label: `${k.name} (KVN ${k.kvn}, ${k.status})`,
                }))}
            />
          </>
        )}

        {action === "replace" && (
          <Typography.Paragraph>
            This revokes <strong>{card.cardId}</strong> permanently and creates
            a fresh card for the same cardholder.
          </Typography.Paragraph>
        )}

        {action === "revoke" && (
          <Typography.Paragraph type="danger">
            Revoking is final — the card can never return to service.
          </Typography.Paragraph>
        )}

        <Input.TextArea
          rows={3}
          placeholder={
            action && REASON_REQUIRED.includes(action)
              ? "Reason (required)"
              : "Reason (optional)"
          }
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </>
  );
};

export default CardDetailPage;
