import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  List,
  Progress,
  Result,
  Select,
  Space,
  Steps,
  Switch,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  LoadingOutlined,
} from "@ant-design/icons";
import ApduTrace from "../components/ApduTrace";
import type { PersonalizeProgress, ReaderState } from "../@type/preload";

/**
 * The screen that replaces running the demo scripts by hand.
 *
 * Steps: wait for a card -> confirm the cardholder -> options -> run ->
 * result. The run itself is driven by the main process (cardService), which
 * walks the server-provided plan; this page only renders progress and the
 * APDU trace.
 */

type StepResult = { key: string; ok: boolean; sw?: string; error?: string };

const PersonalizeWizardPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [current, setCurrent] = useState(0);
  const [card, setCard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [csn, setCsn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState({
    cardCode: "",
    initialPin: "11111111",
    generateSeed: false,
  });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PersonalizeProgress | null>(null);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [outcome, setOutcome] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const loadCard = useCallback(async () => {
    try {
      const data = await window.cms.api.get(`/cards/${id}`);
      setCard(data);
      setOptions((o) => ({ ...o, cardCode: o.cardCode || data.cardId }));
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  useEffect(() => {
    window.cms.reader.state().then(setReader).catch(() => undefined);
    const offState = window.cms.reader.onStateChanged(setReader);
    const offProgress = window.cms.card.onProgress(setProgress);
    return () => {
      offState();
      offProgress();
    };
  }, []);

  const readCsn = async () => {
    setError(null);
    try {
      const value = await window.cms.card.readCsn();
      setCsn(value);
      setCurrent(1);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await window.cms.api.get("/users", { limit: 100 });
      setUsers(data.items);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const assignUser = async (userId: string) => {
    try {
      await window.cms.api.post(`/cards/${id}/assign-user`, { userId });
      message.success("Cardholder assigned");
      await loadCard();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setStepResults([]);
    setProgress(null);
    setCurrent(3);

    try {
      const result = await window.cms.card.personalize(id!, {
        cardCode: options.cardCode || undefined,
        initialPin: options.initialPin || undefined,
        generateSeed: options.generateSeed,
      });
      setStepResults(result.stepResults);
      setOutcome({ success: result.success, error: result.error });
      setCard(result.card);
      setCurrent(4);
    } catch (e: any) {
      // A throw here means the run never started (e.g. no card, server down);
      // the card's own state is handled server-side either way.
      setOutcome({ success: false, error: e.message });
      setCurrent(4);
    } finally {
      setRunning(false);
      void loadCard();
    }
  };

  const percent = progress
    ? Math.round(
        ((progress.stepIndex + (progress.phase === "done" ? 1 : 0)) /
          progress.totalSteps) *
          100
      )
    : 0;

  const steps = [
    {
      title: "Insert card",
      content: (
        <Card>
          {!reader?.available && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="PC/SC support is not available in this build"
              description="Card operations are disabled. See README > Native module setup."
            />
          )}
          <Typography.Paragraph>
            Place the card on the reader, then read its serial number.
          </Typography.Paragraph>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Reader">
              {reader?.deviceName || "not detected"}
            </Descriptions.Item>
            <Descriptions.Item label="Card">
              {reader?.cardPresent ? (
                <Tag color="processing">present</Tag>
              ) : (
                <Tag>absent</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="ATR">
              {reader?.atr || "—"}
            </Descriptions.Item>
          </Descriptions>
          <Button
            type="primary"
            style={{ marginTop: 16 }}
            disabled={!reader?.cardPresent}
            onClick={readCsn}
          >
            Read serial number
          </Button>
        </Card>
      ),
    },
    {
      title: "Cardholder",
      content: (
        <Card>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Card ID">
              {card?.cardId}
            </Descriptions.Item>
            <Descriptions.Item label="CSN read">{csn || "—"}</Descriptions.Item>
            <Descriptions.Item label="Cardholder">
              {card?.userId?.fullName || (
                <Typography.Text type="secondary">unassigned</Typography.Text>
              )}
            </Descriptions.Item>
          </Descriptions>

          {!card?.userId && (
            <Space style={{ marginTop: 16 }} direction="vertical">
              <Typography.Text>
                This card has no cardholder. Assign one now, or continue and
                assign it before issuing.
              </Typography.Text>
              <Space>
                <Select
                  style={{ width: 320 }}
                  placeholder="Pick a cardholder"
                  onFocus={loadUsers}
                  onChange={assignUser}
                  options={users.map((u) => ({
                    value: u._id,
                    label: `${u.fullName}${
                      u.nationalId ? ` · ${u.nationalId}` : ""
                    }`,
                  }))}
                />
              </Space>
            </Space>
          )}

          <div style={{ marginTop: 16 }}>
            <Space>
              <Button onClick={() => setCurrent(0)}>Back</Button>
              <Button type="primary" onClick={() => setCurrent(2)}>
                Continue
              </Button>
            </Space>
          </div>
        </Card>
      ),
    },
    {
      title: "Options",
      content: (
        <Card>
          <Form layout="vertical" style={{ maxWidth: 420 }}>
            <Form.Item
              label="Card code written to the applet"
              extra="Defaults to the CMS card ID."
            >
              <Input
                value={options.cardCode}
                onChange={(e) =>
                  setOptions({ ...options, cardCode: e.target.value })
                }
              />
            </Form.Item>
            <Form.Item
              label="Initial PIN"
              extra="The cardholder changes this on activation."
            >
              <Input
                value={options.initialPin}
                onChange={(e) =>
                  setOptions({ ...options, initialPin: e.target.value })
                }
              />
            </Form.Item>
            <Form.Item
              label="Generate on-card HD wallet seed"
              tooltip="Leave off: the cardholder creates the wallet in the wallet app, which is where the mnemonic is shown to them and nowhere else. The wallet app also refuses a card that already has a seed."
            >
              <Switch
                checked={options.generateSeed}
                onChange={(v) => setOptions({ ...options, generateSeed: v })}
              />
            </Form.Item>
          </Form>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Applet installation is not part of this run"
            description="The card is expected to already carry the applet. Loading a CAP file is handled separately — see the project plan."
          />

          <Space>
            <Button onClick={() => setCurrent(1)}>Back</Button>
            <Button
              type="primary"
              onClick={run}
              disabled={!reader?.cardPresent}
            >
              Start personalization
            </Button>
          </Space>
        </Card>
      ),
    },
    {
      title: "Run",
      content: (
        <Card>
          <Progress percent={percent} status={running ? "active" : undefined} />
          {progress && (
            <Typography.Paragraph style={{ marginTop: 12 }}>
              {progress.phase === "start" && <LoadingOutlined />}{" "}
              Step {progress.stepIndex + 1} of {progress.totalSteps}:{" "}
              <strong>{progress.step.label}</strong>
              {progress.error && (
                <Typography.Text type="danger"> — {progress.error}</Typography.Text>
              )}
            </Typography.Paragraph>
          )}
          <Typography.Paragraph type="secondary">
            Do not remove the card until the run finishes.
          </Typography.Paragraph>
        </Card>
      ),
    },
    {
      title: "Result",
      content: (
        <Card>
          {outcome?.success ? (
            <Result
              status="success"
              title="Card personalized"
              subTitle={`${card?.cardId} is now ${card?.state}. Issue it from the card detail screen when you hand it over.`}
              extra={[
                <Button
                  key="detail"
                  type="primary"
                  onClick={() => navigate(`/cards/${id}`)}
                >
                  Open card
                </Button>,
                <Link key="list" to="/cards">
                  <Button>Back to cards</Button>
                </Link>,
              ]}
            />
          ) : (
            <Result
              status="error"
              title="Personalization failed"
              subTitle={outcome?.error}
              extra={[
                <Button key="retry" type="primary" onClick={() => setCurrent(0)}>
                  Retry
                </Button>,
                <Button key="detail" onClick={() => navigate(`/cards/${id}`)}>
                  Open card
                </Button>,
              ]}
            />
          )}

          {stepResults.length > 0 && (
            <List
              size="small"
              bordered
              style={{ marginTop: 16 }}
              header={<strong>Step results</strong>}
              dataSource={stepResults}
              renderItem={(r) => (
                <List.Item>
                  <Space>
                    {r.ok ? (
                      <CheckCircleTwoTone twoToneColor="#52c41a" />
                    ) : (
                      <CloseCircleTwoTone twoToneColor="#ff4d4f" />
                    )}
                    <code>{r.key}</code>
                    {r.sw && <Tag>SW {r.sw}</Tag>}
                    {r.error && (
                      <Typography.Text type="danger">{r.error}</Typography.Text>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          )}
        </Card>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Personalize {card?.cardId || ""}
      </Typography.Title>


      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Steps
        current={current}
        items={steps.map((s) => ({ title: s.title }))}
        style={{ marginBottom: 24 }}
      />

      <div style={{ marginBottom: 16 }}>{steps[current].content}</div>

      <ApduTrace defaultOpen={current >= 3} />
    </>
  );
};

export default PersonalizeWizardPage;
