import React from "react";
import ReactDOM from "react-dom/client";
import Root from "./Root";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/cyrillic-400.css";
import "@fontsource/geist/cyrillic-500.css";
import "@fontsource/geist/cyrillic-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "./styles.css";
import "./platform-design.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
