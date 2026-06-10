/**
 * Meta WhatsApp Cloud API constants (PRD-112 RF-004 / RNF-006).
 * API version is PINNED — bumping it is an explicit PR, never `v_LATEST`.
 */

import type { IProviderCapabilities } from "../types";

export const META_API_VERSION = "v20.0";
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Secret-name suffixes appended to `whatsapp_accounts.credentials_ref`
 * (e.g. ref `WHATSAPP_META_MATRIZ` → `WHATSAPP_META_MATRIZ_ACCESS_TOKEN`).
 * The secrets live as Edge Function secrets — never in the database.
 */
export const META_SECRET_SUFFIXES = {
  accessToken: "_ACCESS_TOKEN",
  appSecret: "_APP_SECRET",
  webhookVerifyToken: "_VERIFY_TOKEN",
} as const;

export const META_MAX_TEXT_LENGTH = 4096;
export const META_MAX_MEDIA_BYTES = 16 * 1024 * 1024; // 16 MiB

/** Upload mime types accepted by the Cloud API media endpoint. */
export const META_SUPPORTED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "video/mp4",
  "video/3gp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
] as const;

export const META_CAPABILITIES: IProviderCapabilities = {
  supportsTemplates: true,
  supportsInteractive: true,
  supportsMediaUpload: true,
  supportsStatusReadReceipts: true,
  supportsCustomWebhook: false,
  maxMessageLength: META_MAX_TEXT_LENGTH,
  maxMediaSizeBytes: META_MAX_MEDIA_BYTES,
};

export const META_INTERACTIVE_MAX_BUTTONS = 3;
export const META_INTERACTIVE_MAX_LIST_ROWS = 10;
