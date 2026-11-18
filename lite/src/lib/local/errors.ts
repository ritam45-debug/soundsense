export class ClientError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}, public code = "error") {
    super(message);
  }
}
