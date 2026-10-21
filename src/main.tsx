import { createRoot } from "react-dom/client";
import App from "./App";
// Self-hosted OFL fonts, Latin subsets only; other scripts fall back to system fonts.
import "@fontsource/orbitron/latin-700.css";
import "@fontsource/orbitron/latin-900.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/exo-2/latin-400.css";
import "@fontsource/exo-2/latin-500.css";
import "@fontsource/news-cycle/latin-400.css";
import "@fontsource/news-cycle/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
