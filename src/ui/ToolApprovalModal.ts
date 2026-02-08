import { Modal } from 'obsidian';

export interface ToolApprovalRequest {
    toolName: string;
    description: string;
    parameters: Record<string, unknown>;
}

export class ToolApprovalModal extends Modal {
    private request: ToolApprovalRequest;
    private resolve: (approved: boolean) => void;
    private resolved = false;

    constructor(
        app: Modal['app'],
        request: ToolApprovalRequest,
        resolve: (approved: boolean) => void
    ) {
        super(app);
        this.request = request;
        this.resolve = resolve;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h3', { text: 'Approve AI change?' });
        contentEl.createEl('p', {
            text: 'The assistant is requesting permission to modify your vault.'
        });

        const details = contentEl.createDiv('tool-approval-details');
        details.createEl('div', { text: `Tool: ${this.request.toolName}` });
        details.createEl('div', { text: `Description: ${this.request.description}` });

        const paramsBlock = details.createDiv('tool-approval-params');
        paramsBlock.createEl('h4', { text: 'Parameters' });

        const formattedParams = this.formatParameters(this.request.parameters);
        paramsBlock.createEl('pre', { text: formattedParams });

        const contentPreview = this.getContentPreview(this.request.parameters);
        if (contentPreview) {
            const previewBlock = details.createDiv('tool-approval-preview');
            previewBlock.createEl('h4', { text: 'Content preview' });
            previewBlock.createEl('pre', { text: contentPreview });
        }

        const buttonRow = contentEl.createDiv('tool-approval-buttons');
        const rejectButton = buttonRow.createEl('button', { text: 'Reject' });
        const approveButton = buttonRow.createEl('button', { text: 'Approve' });
        approveButton.addClass('mod-cta');

        rejectButton.addEventListener('click', () => this.handleDecision(false));
        approveButton.addEventListener('click', () => this.handleDecision(true));
    }

    onClose(): void {
        if (!this.resolved) {
            this.resolve(false);
        }
    }

    private handleDecision(approved: boolean): void {
        this.resolved = true;
        this.resolve(approved);
        this.close();
    }

    private formatParameters(parameters: Record<string, unknown>): string {
        try {
            return JSON.stringify(parameters, null, 2);
        } catch {
            return '[Unserializable parameters]';
        }
    }

    private getContentPreview(parameters: Record<string, unknown>): string | null {
        const content = parameters.content;
        if (typeof content !== 'string') {
            return null;
        }

        const maxLength = 800;
        if (content.length <= maxLength) {
            return content;
        }

        return `${content.slice(0, maxLength)}\n... (${content.length - maxLength} more characters)`;
    }
}
