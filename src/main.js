import { mount } from "svelte";
import "./styles/tailwind.css";
import "./app.css";
import App from "./App.svelte";

mount(App, {
  target: document.getElementById("app")
});
