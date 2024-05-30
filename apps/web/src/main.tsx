import ReactDOM from "react-dom/client";
import { setAutoFreeze } from "immer";

import { App } from "./App";
import "unfonts.css";
import "./main.css";

setAutoFreeze(false);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
