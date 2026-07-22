import { App } from "./integration/App";

const app = new App();

app.start().catch(console.error);