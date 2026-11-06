import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import App from "./app";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found in index.html");

createRoot(container).render(<App />);
