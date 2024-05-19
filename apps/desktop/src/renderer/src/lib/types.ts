export enum ChatNodeDataType {
  CONVERSATION = "conversation",
  IMAGE = "image",
  FILE = "text_file",
  FLATTEN = "flatten",
}

export type ChatNode =
  | {
      id: string;
      type: ChatNodeDataType.CONVERSATION;
      context?: ChatNode[]; // lm_267b095b1b only supports 1 conversation node in context
      party: "user" | "ai";
      content: string;
    }
  | {
      id: string;
      type: ChatNodeDataType.IMAGE;
      content: string; // base64 encoded image
    }
  | {
      id: string;
      type: ChatNodeDataType.FILE;
      fileType: "text" | "image" | "pdf";
      path: string;
    }
  | {
      id: string;
      type: ChatNodeDataType.FLATTEN;
      context?: ChatNode & { type: ChatNodeDataType.CONVERSATION };
    };
