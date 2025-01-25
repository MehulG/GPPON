import os
import subprocess

# Define the payload (can be received as input)
payload = {
    "image": "jrottenberg/ffmpeg:latest",
    "cpu": 2,
    "memory": 1024,
    "storage": 5,
    "env": {
        "INPUT_FILE": ["input.mp4"],
        "OUTPUT_FILE": ["result.mp4"]
    },
    "resolution": "500:-2"  # Assuming this is part of your payload for resolution
}

# Step 1: Create Dockerfile dynamically
def create_dockerfile(payload):
    input_file = payload['env']['INPUT_FILE'][0]  # Get input file from payload
    output_file = payload['env']['OUTPUT_FILE'][0]  # Get output file name from payload

    dockerfile_content = f"""
    FROM {payload['image']}

    # Set environment variables
    {"".join([f'ENV {key}={",".join(value)}\n' for key, value in payload['env'].items()])}

    # Set the working directory
    WORKDIR /app

    # Copy input files (Assume these files are in the current directory)
    COPY {input_file} /app
    RUN mkdir -p /output

    # Command to run
    CMD [ "ffmpeg", "-i", "/app/{input_file}", "-vf", "scale={payload['resolution']}", "-c:a", "copy", "/output/{output_file}" ]
    """

    with open('Dockerfile', 'w') as file:
        file.write(dockerfile_content)
    print("Dockerfile created!")

# Step 2: Build Docker image
def build_docker_image():
    subprocess.run(['docker', 'build', '-t', 'ffmpeg_process', '.'], check=True)
    print("Docker image built successfully!")

# Step 3: Run the Docker container with volume mounting
def run_docker_container(input_file, output_file, resolution):
    run_cmd = [
        "docker", "run", "--rm", 
        "-v", f"{os.getcwd()}:/output",  # Mount current directory to /output
        "ffmpeg_process", 
        "-i", f"/app/{input_file}",  # Use input file from payload
        "-vf", f"scale={resolution}", 
        "-c:a", "copy", 
        f"/output/{output_file}"
    ]
    subprocess.run(run_cmd, check=True)
    print(f"Processed video saved as {output_file} in the current directory.")

# Run the functions
if __name__ == '__main__':
    # Create Dockerfile
    create_dockerfile(payload)
    # Build the Docker image
    build_docker_image()
    # Run the Docker container with input and output files
    input_file = payload["env"]["INPUT_FILE"][0]  # Get input file from payload
    output_file = payload["env"]["OUTPUT_FILE"][0]  # Get output file from payload
    run_docker_container(input_file, output_file, payload["resolution"])