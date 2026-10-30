export declare const evidenceHash: (value: any) => string;
export declare function reconciliationFingerprint(manifest: any, artifactHashes: any): string;
export declare function compareBenchmark(metric: any, expected: any, actual: any, { complete, exact, displayPercent }?: {
    complete?: boolean | undefined;
    displayPercent?: boolean | undefined;
    exact?: boolean | undefined;
}): {
    metric: any;
    expected: string | null;
    actual: string | null;
    status: string;
    reason: string;
    delta: null;
    relativeDelta: null;
} | {
    metric: any;
    expected: string;
    actual: string;
    status: string;
    reason: string | null;
    delta: string;
    relativeDelta: string | null;
};
export declare function compareClassification(legacy: any, daily: any, alternative: any, currency: any): {
    oldRuleVersion: any;
    sameStockBasis: boolean;
    oldSkuCount: number;
    newSkuCount: number;
    matrix: any[];
    alternative: {
        ruleVersion: any;
        sameStockBasis: boolean;
        oldDeadCost: any;
        alternativeDeadCost: any;
        costDifference: any;
        oldDeadSkuCount: any;
        alternativeDeadSkuCount: any;
        onlyOldSkuCount: any;
        onlyAlternativeSkuCount: any;
        onlyOldCost: any;
        onlyAlternativeCost: any;
        sharedValueDifference: any;
    } | null;
} | null;
export declare function reconcileZavod(input: Record<string, any>): {
    schemaVersion: number;
    fixtureId: any;
    fixtureRevision: any;
    fingerprint: string;
    status: string;
    numericStatus: string;
    blockers: any[];
    checks: ({
        metric: any;
        expected: string | null;
        actual: string | null;
        status: string;
        reason: string;
        delta: null;
        relativeDelta: null;
    } | {
        metric: any;
        expected: string;
        actual: string;
        status: string;
        reason: string | null;
        delta: string;
        relativeDelta: string | null;
    })[];
    classification: {
        oldRuleVersion: any;
        sameStockBasis: boolean;
        oldSkuCount: number;
        newSkuCount: number;
        matrix: any[];
        alternative: {
            ruleVersion: any;
            sameStockBasis: boolean;
            oldDeadCost: any;
            alternativeDeadCost: any;
            costDifference: any;
            oldDeadSkuCount: any;
            alternativeDeadSkuCount: any;
            onlyOldSkuCount: any;
            onlyAlternativeSkuCount: any;
            onlyOldCost: any;
            onlyAlternativeCost: any;
            sharedValueDifference: any;
        } | null;
    } | null;
    calculationIds: {
        sales: any;
        daily: any;
        settings: any;
    };
    thresholds: {
        [k: string]: any;
    } | null;
    diagnostics: any;
    referenceObservations: {
        channelSum: any;
        channelHeadlineDifference: string | null;
        oldDeadAlternativeCostDifference: string | null;
        oldDeadAlternativeSkuDifference: string | null;
        note: string;
    };
    provenanceNote: string;
};
