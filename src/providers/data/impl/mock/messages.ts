import { messagesApi } from "@/mocks";
import type { IMessagesProvider } from "../../contracts/messages";

export const mockMessagesProvider: IMessagesProvider = {
  list: (params) => messagesApi.list(params),
  send: (conversationId, input) => messagesApi.send(conversationId, input),
  markStatus: (messageId, status) => messagesApi.markStatus(messageId, status),
  simulateIncoming: (conversationId, text) => messagesApi.simulateIncoming(conversationId, text),
};
