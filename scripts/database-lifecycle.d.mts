export declare function validateDatabaseTarget(env: any): void;
export declare function runDatabaseLifecycle(mode: string, { env, run, log }?: {
    env?: Record<string, string | undefined>;
    run?: (tool: "prisma" | "next", args: string[]) => number;
    log?: (message: string) => void;
}): number;
