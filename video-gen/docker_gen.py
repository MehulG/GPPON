import os
import subprocess
import json
import re

# Function to replace placeholders
def replace_placeholders(value, env_dict):
    """Replaces {{var}} placeholders with corresponding env values."""
    if isinstance(value, str):
        return re.sub(r"\{\{(.*?)\}\}", lambda match: env_dict.get(match.group(1), match.group(0)), value)
    return value

def create_dockerfile(payload_json):
    # Parse payload from JSON
    payload =payload_json

    # Initialize Dockerfile lines list
    dockerfile = []

    # Helper function to replace placeholders in a string
    def replace_placeholders(value, env_dict):
        """Replaces {{var}} placeholders with corresponding env values."""
        if isinstance(value, str):
            return re.sub(r"\{\{(.*?)\}\}", lambda match: env_dict.get(match.group(1), match.group(0)), value)
        return value

    # Set base image
    dockerfile.append(f"FROM {payload['image']}")

    # Set environment variables
    for key, value in payload.get("env", {}).items():
        dockerfile.append(f'ENV {key.upper()}="{value}"')

    # Set entrypoint (ensure it's in the correct JSON format)
    entrypoint = json.dumps(payload.get("entrypoint", []))
    dockerfile.append(f'ENTRYPOINT {entrypoint}')

    # Resolve CMD dynamically by replacing placeholders
    env = payload["env"]
    cmd_resolved = [replace_placeholders(part, env) for part in payload["cmd"]]

    # Set CMD (ensure it's in the correct JSON format)
    cmd_resolved_json = json.dumps(cmd_resolved)
    dockerfile.append(f'CMD {cmd_resolved_json}')

    # Convert list to string for final Dockerfile content
    dockerfile_content = "\n".join(dockerfile)

    # Save Dockerfile to file
    with open("Dockerfile", "w") as f:
        f.write(dockerfile_content)

    # Optionally return the generated Dockerfile content
    return dockerfile_content
    print(dockerfile_content)

# def create_dockerfile(payload):
#     """Create Dockerfile with direct FFmpeg command"""
#     env_vars = payload.get('env', {})
#     input_file = env_vars.get('input', 'input.mp4')
#     output_file = env_vars.get('output', 'output.mp4')
#     resolution = env_vars.get('resolution', '500:-2')

#     dockerfile_content = f"""
# FROM {payload.get('image', 'jrottenberg/ffmpeg:latest')}

# # Set working directory
# WORKDIR /app

# # Copy input file
# COPY {input_file} /app/

# # Ensure output directory exists
# RUN mkdir -p /output

# {f'ENTRYPOINT {json.dumps(payload["entrypoint"])}' if payload.get('entrypoint') else ''}

# CMD ["-i", "/app/{input_file}", "-vf", "scale={resolution}", "-c:a", "copy", "/output/{output_file}"]
# """
    
#     with open('Dockerfile', 'w') as file:
#         file.write(dockerfile_content)
#     return 'Dockerfile'

def run_docker_container(payload):
    """Execute Docker container with comprehensive configuration"""
    run_cmd = [
        'docker', 'run', '--rm',
        # Resource constraints
        *([f'--cpus={payload.get("cpu", 1)}'] if payload.get('cpu') else []),
        *([f'--memory={payload.get("memory", 512)}M'] if payload.get('memory') else []),
        
        # Volume mounts
        '-v', f'{os.getcwd()}:/app',
        '-v', f'{os.getcwd()}:/output',
        
        # Image
        'dynamic_image'
    ]
    
    try:
        result = subprocess.run(run_cmd, capture_output=True, text=True, check=True)
        print("Container executed successfully!")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print("Execution Error:")
        print("Return Code:", e.returncode)
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        raise

def main(payload):
    """Orchestrate Dockerfile creation, image building, and container running"""
    create_dockerfile(payload)
    subprocess.run(['docker', 'build', '-t', 'dynamic_image', '.'], check=True)
    run_docker_container(payload)

# Example payload
if __name__ == '__main__':
    ffmpeg_payload = {
        "image": "jrottenberg/ffmpeg:latest",
        "cpu": 2,
        "memory": 1024,
        "env": {
            "input": "big_buck_bunny_720p_20mb.mp4",
            "output": "result.mp4",
            "resolution": "100:100"
        },
        "cmd": [
            "-i", "/app/{{input}}", 
            "-vf", "scale={{resolution}}", 
            "-c:a", "copy", 
            "/output/{{output}}"
        ],
        "entrypoint": ["ffmpeg"]
    }
    python_payload = {
        "image": "python:3.9-slim",
        "entrypoint": ["python"],
        "cmd": [
            "-c", 
            "import pandas as pd; print(pd.DataFrame({'col1': [1,2,3]}))"
        ]
    }
    
    main(ffmpeg_payload)

# import os
# import subprocess
# import shlex

# def create_dockerfile(payload):
#     """Create Dockerfile with robust command handling"""
#     dockerfile_content = f"""
# FROM {payload.get('image', 'ubuntu:latest')}

# # Set up working directory
# WORKDIR /app

# # Copy input files if any
# COPY {payload.get('input_file', '*')} /app/

# # Ensure output directory exists
# RUN mkdir -p /output

# # Entrypoint to handle command execution
# ENTRYPOINT ["ffmpeg"]
# CMD {payload.get('cmd', ['-h'])}
# """
    
#     with open('Dockerfile', 'w') as file:
#         file.write(dockerfile_content)
#     print("Dockerfile created successfully!")
#     return 'Dockerfile'

# def run_docker_container(payload):
#     """Run Docker container with robust volume and command handling"""
#     # Prepare base docker run command
#     run_cmd = [
#         'docker', 'run', '--rm',
#         # Resource constraints
#         *([f'--cpus={payload.get("cpu", 1)}'] if payload.get('cpu') else []),
#         *([f'--memory={payload.get("memory", 512)}M'] if payload.get('memory') else []),
        
#         # Volume mounts
#         '-v', f'{os.getcwd()}:/app',
#         '-v', f'{os.getcwd()}:/output',
        
#         # Image and command
#         'dynamic_image'
#     ]
    
#     # Add FFmpeg command from payload
#     if payload.get('cmd'):
#         run_cmd.extend(payload['cmd'])
    
#     try:
#         # Execute the docker run command
#         result = subprocess.run(run_cmd, capture_output=True, text=True, check=True)
#         print("Docker container executed successfully!")
#         print(result.stdout)
#     except subprocess.CalledProcessError as e:
#         print("Error running Docker container:")
#         print("STDOUT:", e.stdout)
#         print("STDERR:", e.stderr)
#         raise

# def build_docker_image():
#     """Build Docker image"""
#     try:
#         subprocess.run(['docker', 'build', '-t', 'dynamic_image', '.'], check=True)
#         print("Docker image built successfully!")
#     except subprocess.CalledProcessError as e:
#         print(f"Error building Docker image: {e}")
#         raise

# def main(payload):
#     """Main orchestration function"""
#     # Create Dockerfile
#     create_dockerfile(payload)
    
#     # Build Docker image
#     build_docker_image()
    
#     # Run Docker container
#     run_docker_container(payload)

# # Example payload
# if __name__ == '__main__':
#     ffmpeg_payload = {
#         "image": "jrottenberg/ffmpeg:latest",
#         "input_file": "big_buck_bunny_720p_20mb.mp4",
#         "cmd": [
#             "-i", "/app/big_buck_bunny_720p_20mb.mp4", 
#             "-vf", "scale=500:-2", 
#             "-c:a", "copy", 
#             "/output/result.mp4"
#         ],
#         "cpu": 2,
#         "memory": 1024
#     }
    
#     main(ffmpeg_payload)