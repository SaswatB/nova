import { css } from "styled-system/css";

export function App(): JSX.Element {
  return (
    <>
      <div className={css({ color: "text.primary" })}>Powered by electron-vite</div>
      <div className="text">
        Build an Electron app with <span className="react">React</span> and <span className="ts">TypeScript</span>
      </div>
      <p className="tip">
        Please try pressing <code>F12</code> to open the devTool
      </p>
    </>
  );
}
