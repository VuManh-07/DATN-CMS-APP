import React, { useEffect, useRef, useState } from "react";
import { Button, Collapse, Space, Typography } from "antd";
import type { ApduTraceEntry } from "../@type/preload";

/**
 * Live APDU trace panel.
 *
 * This is what makes the GUI a replacement for running the demo by hand
 * rather than a black box: the operator sees the same command/response hex
 * that the console version printed, and can compare the two.
 */

const COLOR: Record<ApduTraceEntry["direction"], string> = {
  command: "#1677ff",
  response: "#389e0d",
  info: "#8c8c8c",
  error: "#cf1322",
};

const PREFIX: Record<ApduTraceEntry["direction"], string> = {
  command: ">>",
  response: "<<",
  info: "--",
  error: "!!",
};

/** Keep memory bounded on long batch runs. */
const MAX_ENTRIES = 500;

export const ApduTrace: React.FC<{ defaultOpen?: boolean }> = ({
  defaultOpen = false,
}) => {
  const [entries, setEntries] = useState<ApduTraceEntry[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      window.cms.card.onTrace((entry) =>
        setEntries((prev) => [...prev, entry].slice(-MAX_ENTRIES))
      ),
    []
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  const body = (
    <div
      style={{
        maxHeight: 260,
        overflowY: "auto",
        background: "#141414",
        borderRadius: 6,
        padding: 12,
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {entries.length === 0 ? (
        <Typography.Text type="secondary">
          No APDUs yet. Trace appears here as commands run.
        </Typography.Text>
      ) : (
        entries.map((e, i) => (
          <div key={`${e.at}-${i}`} style={{ color: COLOR[e.direction] }}>
            <span style={{ opacity: 0.6 }}>
              {new Date(e.at).toLocaleTimeString()} {PREFIX[e.direction]}{" "}
            </span>
            <span style={{ wordBreak: "break-all" }}>{e.text}</span>
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );

  return (
    <Collapse
      defaultActiveKey={defaultOpen ? ["trace"] : []}
      items={[
        {
          key: "trace",
          label: (
            <Space>
              <span>APDU trace</span>
              <Typography.Text type="secondary">
                ({entries.length})
              </Typography.Text>
            </Space>
          ),
          extra: (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setEntries([]);
              }}
            >
              Clear
            </Button>
          ),
          children: body,
        },
      ]}
    />
  );
};

export default ApduTrace;
