declare const GPUBufferUsage: {
    readonly COPY_DST: number;
    readonly COPY_SRC: number;
    readonly MAP_READ: number;
    readonly STORAGE: number;
    readonly UNIFORM: number;
};

declare const GPUMapMode: {
    readonly READ: number;
};

type GPUBufferUsageFlags = number;
type GPUMapModeFlags = number;
type GPUShaderStageFlags = number;

interface Navigator {
    readonly gpu?: GPU;
}

interface GPU {
    requestAdapter(): Promise<GPUAdapter | null>;
}

interface GPUAdapter {
    requestDevice(): Promise<GPUDevice>;
}

interface GPUDevice {
    readonly queue: GPUQueue;
    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
    createCommandEncoder(): GPUCommandEncoder;
    createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
    createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
}

interface GPUQueue {
    submit(commandBuffers: GPUCommandBuffer[]): void;
    writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource): void;
}

interface GPUBuffer {
    destroy(): void;
    getMappedRange(): ArrayBuffer;
    mapAsync(mode: GPUMapModeFlags): Promise<void>;
    unmap(): void;
}

interface GPUBufferDescriptor {
    size: number;
    usage: GPUBufferUsageFlags;
}

interface GPUShaderModuleDescriptor {
    code: string;
}

interface GPUComputePipelineDescriptor {
    layout: 'auto';
    compute: {
        module: GPUShaderModule;
        entryPoint: string;
    };
}

interface GPUComputePipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUBindGroupDescriptor {
    layout: GPUBindGroupLayout;
    entries: GPUBindGroupEntry[];
}

interface GPUBindGroupEntry {
    binding: number;
    resource: { buffer: GPUBuffer };
}

interface GPUCommandEncoder {
    beginComputePass(): GPUComputePassEncoder;
    copyBufferToBuffer(
        source: GPUBuffer,
        sourceOffset: number,
        destination: GPUBuffer,
        destinationOffset: number,
        size: number,
    ): void;
    finish(): GPUCommandBuffer;
}

interface GPUComputePassEncoder {
    dispatchWorkgroups(x: number, y?: number, z?: number): void;
    end(): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    setPipeline(pipeline: GPUComputePipeline): void;
}

interface GPUBindGroup {}
interface GPUBindGroupLayout {}
interface GPUCommandBuffer {}
interface GPUShaderModule {}
