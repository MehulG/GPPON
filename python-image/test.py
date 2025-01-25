import json
import os
import subprocess
import sys
from subprocess import PIPE, STDOUT
# Sample generalized JSON input
# json_input = """
# {
#     "dataProcess": {
#         "image": "python:3.9",
#         "command": ["python", "app.py"],
#         "cpu": 2,
#         "memory": 4096,
#         "env": {
#             "INPUT_FILE": "data.csv",
#             "OUTPUT_FILE": "results.csv"
#         }
#     }
# }
# """

if len(sys.argv) > 1:
        # If JSON input is provided as a command-line argument
        json_input = sys.argv[1]
else:
    print("Error: JSON input is required as an argument.")
    sys.exit(1)

try:
    config = json.loads(json_input)
    print("Parsed JSON input:", json.dumps(config, indent=4))
except json.JSONDecodeError as e:
    print(f"Invalid JSON input: {e}")
    sys.exit(1)

# Example: Access and print the parsed JSON content
print("Parsed JSON input:", json.dumps(config, indent=4))

# Parse JSON
config = json.loads(json_input)
process_name = list(config.keys())[0]  # Dynamically get the process name
process_config = config[process_name]

# Generate Dockerfile
dockerfile_content = f"""
FROM {process_config['image']}
WORKDIR /app
COPY . /app
"""

# Add environment variables to the Dockerfile
if "env" in process_config:
    for key, value in process_config["env"].items():
        dockerfile_content += f"ENV {key}={value}\n"

# Add the command to the Dockerfile
dockerfile_content += f"CMD {json.dumps(process_config['command'])}\n"

# Write Dockerfile
with open("./python-image/Dockerfile", "w") as dockerfile:
    dockerfile.write(dockerfile_content)

print("Dockerfile created successfully.")



current_dir = os.getcwd()
print(f"Current Directory: {current_dir}")

# Construct the path to the target directory
target_dir = os.path.join(current_dir, "python-image")
print(f"Target Directory: {target_dir}")
os.chdir(target_dir)
# Ensure required files exist
for env_file in process_config.get("env", {}).values():
    print("=============", os.getcwd())
    if not os.path.exists(env_file):
        print(f"Error: Required file '{env_file}' not found.")
        exit(1)


# # Build Docker image
# image_name = process_name.lower() + "_image"
# subprocess.run(["docker", "build", "-t", image_name, "."], check=True)
# print(f"Docker image '{image_name}' built successfully.")

# # Run Docker container
# cpu_limit = str(process_config["cpu"])
# memory_limit = f"{process_config['memory']}m"

# # Prepare the `docker run` command
# run_command = [
#     "docker", "run",
#     "--name", process_name.lower() + "_container",
#     "--rm"
# #     "--cpus", cpu_limit,
# #     "--memory", memory_limit
# ]

# # Add environment variables as flags
# if "env" in process_config:
#     for key, value in process_config["env"].items():
#         run_command.extend(["-e", f"{key}={value}"])

# # Mount current directory
# run_command.extend(["-v", os.getcwd() + ":/app"])

# # Specify the image name
# run_command.append(image_name)

# # Execute the container
# subprocess.run(run_command, check=True)

# print(f"Docker container '{process_name.lower()}_container' ran successfully.")

def run_command_with_output(command):
    process = subprocess.Popen(
        command,
        stdout=PIPE,
        stderr=STDOUT,
        universal_newlines=True
    )
    
    for line in process.stdout:
        print(line.strip())  # Print without extra newlines
        
    return_code = process.wait()
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, command)

# Build Docker image
image_name = process_name.lower() + "_image"
try:
    print(f"\nBuilding Docker image '{image_name}'...")
    run_command_with_output(["docker", "build", "-t", image_name, "."])
    print(f"\nDocker image '{image_name}' built successfully.")
except subprocess.CalledProcessError as e:
    print(f"Error building Docker image: {e}")
    sys.exit(1)

# Run Docker container with improved output handling
try:
    print(f"\nRunning Docker container...")
    run_command = [
        "docker", "run",
        "--name", process_name.lower() + "_container",
        "--rm"
    ]
    
    if "env" in process_config:
        for key, value in process_config["env"].items():
            run_command.extend(["-e", f"{key}={value}"])
    
    run_command.extend(["-v", os.getcwd() + ":/app"])
    run_command.append(image_name)
    
    run_command_with_output(run_command)
    print(f"\nDocker container '{process_name.lower()}_container' ran successfully.")
except subprocess.CalledProcessError as e:
    print(f"Error running Docker container: {e}")
    sys.exit(1)