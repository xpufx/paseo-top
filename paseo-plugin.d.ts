declare module "@getpaseo/plugin/react-native" {
  import type { ComponentType, FunctionComponent, ReactNode } from "react";

  export interface PluginIconProps {
    name: string;
    size?: number;
    color?: string;
  }

  export interface ModalProps {
    title: string;
    icon?: ReactNode;
    open: boolean;
    onOpenChange(open: boolean): void;
    children: ReactNode;
  }

  export interface ModalContentProps {
    children: ReactNode;
  }

  export interface ModalComponent extends FunctionComponent<ModalProps> {
    Content: ComponentType<ModalContentProps>;
  }

  export type ToastVariant = "default" | "info" | "success" | "warning" | "error";
  export interface ToastOptions {
    variant?: ToastVariant;
    durationMs?: number;
  }
  export interface ToastApi {
    show(message: string, options?: ToastOptions): void;
    error(message: string): void;
  }

  export const Icon: ComponentType<PluginIconProps>;
  export const Modal: ModalComponent;
  export function useToast(): ToastApi;
}

declare module "@getpaseo/plugin/server" {
  import type { PaseoApi } from "@getpaseo/client";
  import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";

  export interface PluginRpcContract<
    InputSchema extends ZodType = ZodType,
    OutputSchema extends ZodType = ZodType,
  > {
    name: string;
    input: InputSchema;
    output: OutputSchema;
  }

  export function defineRpc<InputSchema extends ZodType, OutputSchema extends ZodType>(
    contract: PluginRpcContract<InputSchema, OutputSchema>,
  ): PluginRpcContract<InputSchema, OutputSchema>;

  export interface PluginHandlerContext {
    paseo: PaseoApi;
  }
}

declare module "@getpaseo/plugin" {
  import type { ComponentType } from "react";
  import type { PaseoApi } from "@getpaseo/client";
  import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";
  import type {
    PluginHandlerContext,
    PluginRpcContract,
  } from "@getpaseo/plugin/server";

  export {
    defineRpc,
    type PluginHandlerContext,
    type PluginRpcContract,
  } from "@getpaseo/plugin/server";

  export interface PluginTheme {
    readonly colors: {
      readonly surface0: string;
      readonly surface1: string;
      readonly surface2: string;
      readonly border: string;
      readonly foreground: string;
      readonly foregroundMuted: string;
      readonly accent: string;
      readonly accentForeground: string;
      readonly statusSuccess: string;
      readonly statusWarning: string;
      readonly statusDanger: string;
    };
  }

  export interface PluginHostProps {
    theme: PluginTheme;
    host: { id: string; label: string };
    layout: { compact: boolean; platform: "ios" | "android" | "web" };
  }

  export interface PluginSurfaceProps extends PluginHostProps {}
  export interface PluginIconProps {
    name: string;
    size?: number;
    color?: string;
  }
  export const Icon: ComponentType<PluginIconProps>;
  export function useRpc<InputSchema extends ZodType, OutputSchema extends ZodType>(
    contract: PluginRpcContract<InputSchema, OutputSchema>,
  ): (input: ZodInput<InputSchema>) => Promise<ZodOutput<OutputSchema>>;
  export function usePaseo(): PaseoApi;

  export interface PluginAgentSnapshot {
    readonly id: string;
    readonly workspaceId: string;
    readonly provider: string;
    readonly status: "initializing" | "idle" | "running" | "error" | "closed";
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly lastActivityAt: string;
    readonly title: string | null;
    readonly cwd: string;
    readonly model: string | null;
    readonly currentModeId: string | null;
    readonly thinkingOptionId: string | null;
    readonly requiresAttention: boolean;
    readonly attentionReason: "finished" | "error" | "permission" | null;
    readonly parentAgentId: string | null;
    readonly labels: Readonly<Record<string, string>>;
  }

  export interface PluginComposerPillProps extends PluginHostProps {
    workspaceId: string;
    agentId: string;
  }
  export interface PluginComposerPillContribution {
    id: string;
    title: string;
    workspaceId: string;
    agentId: string;
    Component: ComponentType<PluginComposerPillProps>;
    onPress(): void | Promise<void>;
  }
  export interface PluginClientContext {
    paseo: PaseoApi;
    rpc<InputSchema extends ZodType, OutputSchema extends ZodType>(
      contract: PluginRpcContract<InputSchema, OutputSchema>,
      input: ZodInput<InputSchema>,
    ): Promise<ZodOutput<OutputSchema>>;
    openSurface(id: string): void;
    addComposerPill(contribution: PluginComposerPillContribution): PluginCleanup;
  }
  export type PluginClientContribution = (client: PluginClientContext) => PluginCleanup;
  export interface PluginContext {
    handle<InputSchema extends ZodType, OutputSchema extends ZodType>(
      contract: PluginRpcContract<InputSchema, OutputSchema>,
      handler: (
        input: ZodOutput<InputSchema>,
        context: PluginHandlerContext,
      ) => ZodInput<OutputSchema> | Promise<ZodInput<OutputSchema>>,
    ): void;
    addSurface(id: string, Component: ComponentType<PluginSurfaceProps>): void;
    addClientSide(contribution: PluginClientContribution): void;
  }
  export type PluginCleanup = () => void | Promise<void>;
}
