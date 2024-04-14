import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./main.css";
import "unfonts.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
