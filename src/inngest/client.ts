import { EventSchemas, Inngest } from "inngest";

type Events = {
  "design/generate.requested": { data: { designId: string } };
  "design/mockups.requested": { data: { designId: string } };
  "design/publish.requested": { data: { designId: string } };
};

export const inngest = new Inngest({
  id: "faithmerch",
  schemas: new EventSchemas().fromRecord<Events>(),
});
