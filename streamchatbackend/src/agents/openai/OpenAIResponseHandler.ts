import OpenAI from "openai";
import type { AssistantStream } from "openai/lib/AssistantStream";
import type { Channel, Event, MessageResponse, StreamChat } from "stream-chat";

export class OpenAIResponseHandler {

    private message_text = "";
    private chunk_counter = 0;
    private run_id = "";
    private is_done = false;
    private last_update_time = 0;


    constructor(
        private readonly openai: OpenAI,
        private readonly openAIThread: OpenAI.Beta.Threads.Thread,
        private readonly assistantStream: AssistantStream,
        private readonly chatClient: StreamChat,
        private readonly channel: Channel,
        private readonly message: MessageResponse,
        private readonly onDispose: () => void
    ) {
        this.chatClient.on("ai_indicator.stop", this.handleStopGenerating)
    }

    private handleStopGenerating = async (event: Event) => {

        if (this.is_done || event.message_id !== this.message.id) return;

        console.log("Stopping generation for message:", this.message.id);

        if (!this.openai || !this.openAIThread || !this.assistantStream) {
            console.error("OpenAI or AssistantStream is not initialized.");
            return;
        }

        try {
            await this.openai.beta.threads.runs.cancel(
                this.openAIThread.id,
                this.run_id; 
            );

        } catch (error) {
            console.log("Error stopping generation:", error);

        }

        await this.channel.sendEvent({
            type: "ai_indicator.clear",
            cid: this.message.cid,
            message_id: this.message.id,
        });

        await this.dispose();

    }

    private handleStreamEvent = async (event: OpenAI.Beta.Assistants.AssistantStreamEvent) => {
        const { cid, id } = this.message;

        if (event.event === "thread.run.created") {
            this.run_id = event.data.id;
        } else if (event.event === "thread.message.delta") {
            const textDelta = event.data.delta.content?.[0];

            if (textDelta?.type === "text" && textDelta?.text) {

                this.message.text += textDelta.text.value || "";
                const now = Date.now();

                if (now - this.last_update_time > 1000) {
                    this.chatClient.partialUpdateMessage(id, {
                        set: {
                            text: this.message.text,
                        },
                    });
                    this.last_update_time = now;
                }

                this.chunk_counter++;
            }
        } else if (event.event === "thread.run.completed") {
            this.chatClient.partialUpdateMessage(id, {
                set: {
                    text: event.data.content[0].type === "text" ? event.data.content[0].text.value : this.message.text,
                },
            });

            this.channel.sendEvent({
                type: "ai_indicator.clear",
                cid: cid,
                message_id: id,
            });

        } else if (event.event === "thread.run.step.created") {

            if (event.data.step_details.type === "message_creation") {
                this.channel.sendEvent({
                    type: "ai_indicator.update",
                    ai_state: "AI_STATE_GENERATING",
                    cd: cid,
                    message_id: id,
                });
            }
        }
    }


    private handleError = async (error: Error) => {
        if (this.is_done) return;

        await this.channel.sendEvent({
            type: "ai_indicator.update",
            ai_state: "AI_STATE_ERROR",
            cd: this.message.cid,
            message_id: this.message.id,
            error: error.message,
        });

        await this.chatClient.partialUpdateMessage(this.message.id, {
            set: {
                text: error.message ?? "An error occurred while processing your request.",
                message: error.toString(),
            }
        }
        )
    }
    private performWebSearch = async (query: string): Promise<string> => {
        const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

        if (!TAVILY_API_KEY) {
            throw new Error("TAVILY_API_KEY is not set");
        };

        console.log("Performing web search for query:", query);

        try {
            const response = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${TAVILY_API_KEY}`
                },
                body: JSON.stringify({
                    query: query,
                    search_depth: "advanced",
                    max_results: 5,
                    include_answers: true,
                    include_raw_content: false,

                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log(`Tavily Search failed for query "${query}": ${errorText}`);

                return JSON.stringify({
                    error: `Tavily Search failed: ${errorText}`,
                    details: errorText

                });

            }

            const data = await response.json();
            console.log(`Tavily Search successful for query "${query}":`, data);
            return JSON.stringify(data);

        } catch (error) {

            console.log(`Tavily Search failed for query "${query}":`, error);
            return JSON.stringify({
                error: `Tavily Search failed: ${error instanceof Error ? error.message : String(error)}`,
                details: error instanceof Error ? error.message : String(error)
            });

        }
    }

    run = async () => { }
    dispose = async () => {
        if (this.is_done) return;
        this.is_done = true;
        this.chatClient.off("ai_indicator.stop", this.handleStopGenerating);
        this.onDispose();

    }



}