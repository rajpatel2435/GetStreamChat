import type { Channel, StreamChat, User } from "stream-chat";

export interface StreamChatAgent {
    user?: User;
    channel?: Channel;
    chatClient?: StreamChat;
    getLastInteraction: () => Promise<Date | null>;
    init: () => Promise<void>;
    dispose: () => Promise<void>;


}

export enum AgentPlatform {
    OPENAI = "openai",
    WRITING_ASSISTANT = "writing_assistant"
}

export interface WritingMessage {
    custom?: {
        suggestion?: string[];
        writingTask?: string;
        messageType?: "user_input" | "ai_response" | "system_message";
    }
}