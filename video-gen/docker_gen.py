import os
import subprocess
import json
import re
import sys

def replace_placeholders(value, env_dict):
    """Replaces {{var}} placeholders with corresponding env values in both strings and lists."""
    
    def get_replacement(match):
        key = match.group(1)  # Extract the key inside {{ }}
        replacement = env_dict.get(key, match.group(0))  # Get value from env_dict or keep original placeholder
        if isinstance(replacement, list):
            return " ".join(map(str, replacement))  # Convert list to space-separated string
        return str(replacement)  # Convert non-string values to strings

    if isinstance(value, str):
        return re.sub(r"\{\{(.*?)\}\}", get_replacement, value)
    
    elif isinstance(value, list):
        return [replace_placeholders(item, env_dict) for item in value]  # Process each list element recursively
    
    return value  # Return unchanged for non-string, non-list types

def create_dockerfile(payload_json):
    # Parse payload from JSON
    payload =payload_json

    # Initialize Dockerfile lines list
    dockerfile = []

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
    cmd_resolved = [replace_placeholders(part, env) for part in payload["command"]]

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

if __name__ == '__main__':
    if len(sys.argv) > 1:
        json_input = sys.argv[1]
    else:
        print("Error: JSON input is required as an argument.")
        sys.exit(1)

    config = json.loads(json_input)
    print("Parsed JSON input:", json.dumps(config, indent=4))
    
    main(config)
