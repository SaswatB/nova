export interface STTClientOptions {
  host?: string;
  sendStartCommand?: boolean;
  reconnectDelay?: number;
  onRealtimeTranscription?: (text: string) => void;
  onFullSentence?: (sentence: string) => void;
  onRecordingStarted?: () => void;
  onVADStarted?: () => void;
  onWakewordDetected?: () => void;
  onTranscriptionStarted?: () => void;
}

export interface STTMessage {
  type: string;
  content: string;
}

export class STTClient {
  private ws!: WebSocket;
  private options: STTClientOptions;

  public constructor(options: STTClientOptions = {}) {
    this.options = {
      host: options.host || "localhost:5025",
      sendStartCommand: options.sendStartCommand || false,
      reconnectDelay: options.reconnectDelay || 5000,
      onRealtimeTranscription: options.onRealtimeTranscription || (() => {}),
      onFullSentence: options.onFullSentence || (() => {}),
      onRecordingStarted: options.onRecordingStarted || (() => {}),
      onVADStarted: options.onVADStarted || (() => {}),
      onWakewordDetected: options.onWakewordDetected || (() => {}),
      onTranscriptionStarted: options.onTranscriptionStarted || (() => {}),
    };
  }

  public connect() {
    const uri = `ws://${this.options.host}`;
    this.ws = new WebSocket(uri);

    this.ws.onopen = () => {
      console.log("Connected to STT server");
      if (this.options.sendStartCommand) {
        this.sendStartRecording();
      }
    };

    this.ws.onmessage = (event) => {
      const messageObj: STTMessage = JSON.parse(event.data);
      this.handleMessage(messageObj);
    };

    this.ws.onclose = () => {
      console.log(`Connection with server closed. Reconnecting in ${this.options.reconnectDelay} ms...`);
      setTimeout(() => this.connect(), this.options.reconnectDelay);
    };

    this.ws.onerror = (error) => {
      console.error(`An error occurred: ${error}. Reconnecting in ${this.options.reconnectDelay} ms...`);
      setTimeout(() => this.connect(), this.options.reconnectDelay);
    };
  }

  public sendStartRecording() {
    const command: STTMessage = {
      type: "command",
      content: "start-recording",
    };
    this.ws.send(JSON.stringify(command));
  }

  private handleMessage(message: STTMessage) {
    switch (message.type) {
      case "realtime":
        this.options.onRealtimeTranscription?.(message.content);
        break;
      case "full":
        this.options.onFullSentence?.(message.content);
        break;
      case "record_start":
        this.options.onRecordingStarted?.();
        break;
      case "vad_start":
        this.options.onVADStarted?.();
        break;
      case "wakeword_start":
        this.options.onWakewordDetected?.();
        break;
      case "transcript_start":
        this.options.onTranscriptionStarted?.();
        break;
      default:
        console.log(`Unknown message: ${JSON.stringify(message)}`);
    }
  }
}
