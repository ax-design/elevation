// <ax-elevation>, built on the surface engine. Markup and --elevation-depth are unchanged; the
// shadow follows the surface shape, so --ax-radius and the other shape properties apply.
import { AxSurface } from '@ax-design/surface';

export class AxElevation extends AxSurface {
    static readonly ElementName = 'ax-elevation';
    static schemaKey = 'ax-elevation';

    protected layerNames_(): string[] {
        return ['elevation'];
    }
}
