import React, { useEffect, useState } from "react";
import { Badge, Space, Tooltip, Typography } from "antd";
import type { ReaderState } from "../@type/preload";

/**
 * Live reader indicator for the app header.
 *
 * Subscribes to push events from the main process rather than polling, so it
 * reflects card insertion immediately — which the personalization wizard
 * depends on to advance its first step.
 */
export const ReaderStatus: React.FC = () => {
  const [state, setState] = useState<ReaderState | null>(null);

  useEffect(() => {
    window.cms.reader.state().then(setState).catch(() => undefined);
    return window.cms.reader.onStateChanged(setState);
  }, []);

  if (!state) return null;

  if (!state.available) {
    return (
      <Tooltip title="The PC/SC native module is not loadable in this build. Card operations are disabled; see README > Native module setup.">
        <Badge status="default" text="PC/SC unavailable" />
      </Tooltip>
    );
  }

  if (!state.deviceName) {
    return <Badge status="warning" text="No reader detected" />;
  }

  return (
    <Space size="middle">
      <Tooltip title={state.deviceName}>
        <Badge status="success" text="Reader connected" />
      </Tooltip>
      {state.cardPresent ? (
        <Tooltip title={`ATR ${state.atr}`}>
          <Badge status="processing" text="Card present" />
        </Tooltip>
      ) : (
        <Typography.Text type="secondary">No card</Typography.Text>
      )}
    </Space>
  );
};

export default ReaderStatus;
