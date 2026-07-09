export interface FileEntry {
  name: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
}

export interface ConnectMsg {
  type: "connect";
  target?: string;
  port?: number;
  password?: string;
}

export interface StdinMsg {
  type: "stdin";
  data: string;
}

export interface ResizeMsg {
  type: "resize";
  rows: number;
  cols: number;
}

export interface ListDirMsg {
  type: "list_dir";
  path: string;
  id?: string;
}

export interface ReadFileMsg {
  type: "read_file";
  path: string;
  id?: string;
}

export interface WriteFileMsg {
  type: "write_file";
  path: string;
  content: string;
  id?: string;
}

export interface DisconnectMsg {
  type: "disconnect";
}

export type OutgoingMsg =
  | ConnectMsg
  | StdinMsg
  | ResizeMsg
  | ListDirMsg
  | ReadFileMsg
  | WriteFileMsg
  | DisconnectMsg;

export interface ConnectedResult {
  type: "connected";
  host: string;
  port: number;
}

export interface StdoutResult {
  type: "stdout";
  data: string;
}

export interface ListDirResult {
  type: "list_dir_result";
  path: string;
  entries: FileEntry[];
  id?: string;
}

export interface ReadFileResult {
  type: "read_file_result";
  path: string;
  content: string;
  id?: string;
}

export interface WriteFileResult {
  type: "write_file_result";
  path: string;
  success: true;
  id?: string;
}

export interface ErrorResult {
  type: "error";
  message: string;
  path?: string;
  id?: string;
}

export type IncomingMsg =
  | ConnectedResult
  | StdoutResult
  | ListDirResult
  | ReadFileResult
  | WriteFileResult
  | ErrorResult;
